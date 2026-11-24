import {
  type Citation,
  type Contact,
  type ContactLevel,
  ContractError,
  type Deadline,
  evidenceStrength,
  formatInZone,
  hoursBetween,
  type LeadDetail,
  type LeadSummary,
  Message,
  type MoveLeadRequest,
  matchScopes,
  bestStrength,
  type Pipeline,
  Project,
  qualify,
  type Requirement,
  resolveDeadline,
  STAGE_ORDER,
  type Stage,
  type SupplierProfile,
  score,
  toZonedIso,
} from "@/contract";
import { getDoc, listDocs, putDoc } from "../db";
import type { Deps } from "../deps";
import {
  AGENTS,
  iso,
  idempotent,
  ledger,
  listActivity,
  logActivity,
  type Org,
  release,
  rep,
  reserve,
  settle,
} from "./base";
import { matchCandidates, subgraphForNotice } from "./graph";
import { getProfile } from "./profile";
import { LeadRec, NoticeRec, SourceRec, stableId } from "./records";

export const supplierNode = (org: Org) => `company:supplier:${org.id}`;
export const noticeNode = (n: { id: string }) => `notice:${n.id}`;

export function citationFor(src: SourceRec, excerpt: string): Citation {
  return {
    sourceId: src.id,
    url: src.url,
    title: src.title,
    excerpt: excerpt.slice(0, 400),
    retrievedAt: src.retrievedAt,
    stampedDate: src.stampedDate,
    version: src.version,
  };
}

function excerptAround(text: string, needle: string): string {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return needle;
  const start = text.lastIndexOf("\n", i) + 1;
  const end = text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i);
  const line = text.slice(start, end);
  if (line.length <= 220) return line;
  // snap a ±90 char window to word boundaries
  let a = Math.max(start, i - 90);
  let b = Math.min(end, i + needle.length + 90);
  while (a > start && !/\s/.test(text[a - 1] ?? "")) a--;
  while (b < end && !/\s/.test(text[b] ?? "")) b++;
  return `${a > start ? "…" : ""}${text.slice(a, b).trim()}${b < end ? "…" : ""}`;
}

function companyTier(estimate: string | null): LeadSummary["companyTier"] {
  const nums = (estimate ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  const max = Math.max(0, ...nums);
  if (max >= 50_000_000) return "enterprise";
  if (max >= 5_000_000 || max === 0) return "mid_market";
  return "small";
}

function segmentFor(profile: SupplierProfile, scopes: string[]): string {
  const s = scopes.join(" ").toLowerCase();
  const pump = profile.adjacentSegments.find((x) => /pump/i.test(x.name) && x.status === "accepted");
  if (pump && /pump/.test(s)) return pump.name;
  return profile.icp.find((f) => f.key === "industries")?.values[0] ?? "Water & wastewater";
}

/** Recompute one lead from its graph evidence: matches → deadlines → qualification → score. */
export async function buildLead(
  deps: Deps,
  org: Org,
  profile: SupplierProfile,
  notice: NoticeRec,
  asOf: string,
): Promise<LeadRec | null> {
  const src = await getDoc(deps.db, org.id, "source", notice.sourceId, SourceRec);
  const project = await getDoc(deps.db, org.id, "project", notice.projectId, Project);
  if (!src || !project) return null;
  const ex = notice.extraction;
  const leadId = stableId(org.id, "lead", project.id, notice.contractorId);
  const existing = await getDoc(deps.db, org.id, "lead", leadId, LeadRec);

  const matches = matchScopes(profile.capabilities, ex.scopes);
  if (matches.length === 0) return null;
  const scopeMatches = matches.map((m) => ({ ...m, citation: citationFor(src, excerptAround(src.text, m.scope)) }));

  const deadlines: Deadline[] = [];
  if (project.bidOpening) {
    deadlines.push({
      kind: "owner_bid_opening",
      belongsTo: "owner",
      at: project.bidOpening,
      rawText: `Owner bid opening ${formatInZone(project.bidOpening, project.timezone)}`,
      derivation: "Utility's bid opening — applies to the prime bidder, not to supplier quotes",
      citation: project.citation,
    });
  }
  for (const d of ex.deadlines) {
    const rule =
      d.rule === "absolute" && d.at
        ? ({ kind: "absolute", at: d.at } as const)
        : d.rule === "hours_before_bid" && d.hoursBeforeBid
          ? ({ kind: "hours_before_bid", hours: d.hoursBeforeBid } as const)
          : ({ kind: "unknown" } as const);
    const r = resolveDeadline(rule, project.bidOpening, project.timezone);
    deadlines.push({
      kind: d.kind,
      belongsTo: d.kind === "supplier_form" ? "form" : "contractor",
      at: r.at,
      rawText: d.rawText,
      derivation: r.derivation,
      citation: citationFor(src, excerptAround(src.text, d.rawText.slice(0, 40))),
    });
  }

  const prevContacts = new Map((existing?.contacts ?? []).map((c) => [c.id, c]));
  const contacts: Contact[] = ex.contacts.map((c) => {
    const id = stableId(org.id, "contact", notice.contractorId, c.kind, c.email ?? c.name ?? "");
    const prev = prevContacts.get(id);
    return {
      id,
      kind: c.kind,
      name: c.name,
      title: c.title,
      email: c.email,
      phone: c.phone,
      linkedinUrl: null,
      published: citationFor(src, excerptAround(src.text, c.email ?? c.name ?? "")),
      verification: prev?.verification ?? {
        status: "unchecked",
        provider: null,
        checkedAt: null,
        score: null,
        note: c.email ? "Published in the contractor's notice; not yet provider-verified" : "No email published for this person — use the published response route",
      },
      isTestContact: false,
    };
  });
  const testId = stableId(org.id, "contact", notice.contractorId, "test");
  contacts.push({
    id: testId,
    kind: "person",
    name: "Demo test contact (team inbox)",
    title: "Labeled research/test contact — not a prospect",
    email: deps.config.demoInbox,
    phone: null,
    linkedinUrl: null,
    published: citationFor(src, "Team-controlled test inbox used for demo delivery"),
    verification: prevContacts.get(testId)?.verification ?? {
      status: "unchecked",
      provider: null,
      checkedAt: null,
      score: null,
      note: "Used to demonstrate the verified-contact billing path",
    },
    isTestContact: true,
  });

  const certs = profile.certifications.map((c) => c.toLowerCase());
  const requirements: Requirement[] = ex.requirements.map((r) => ({
    ...r,
    supplierHas: certs.some((c) => (r.credential ?? r.text).toLowerCase().includes(c)) ? "yes" : "unknown",
  }));

  const regionMatch =
    profile.regions.length === 0
      ? null
      : profile.regions.some((r) => /california|ca\b|bay area/i.test(r)) && /\bCA\b|California/i.test(project.location)
        ? true
        : null;

  const q = qualify({ asOf, deadlines, requirements, regionMatch, conflictingCurrentNotices: false, tz: project.timezone });
  const real = contacts.filter((c) => !c.isTestContact);
  const level: ContactLevel = real.some((c) => c.kind === "person" && c.verification.status === "valid")
    ? "person_verified"
    : real.some((c) => c.kind === "person")
      ? "person"
      : real.some((c) => c.verification.status === "valid")
        ? "mailbox_verified"
        : real.length
          ? "mailbox"
          : "none";
  const s = score({
    status: q.status,
    scopeStrength: bestStrength(matches),
    matchedScopes: matches.length,
    explicitIntent: ex.isSupplierSolicitation,
    hoursRemaining: q.decidingDeadline?.at ? hoursBetween(asOf, q.decidingDeadline.at) : null,
    prepDays: profile.quotePrepDays,
    contactLevel: level,
  });
  const ev = evidenceStrength({
    origin: notice.origin,
    citedClaims: scopeMatches.length + deadlines.length + real.length,
    uncitedClaims: notice.excerptVerified ? 0 : 1,
    verifiedContact: real.some((c) => c.verification.status === "valid"),
  });
  const cutoff = q.decidingDeadline?.at ? formatInZone(q.decidingDeadline.at, project.timezone) : null;
  const nextAction =
    q.status === "actionable"
      ? `Request electrical drawings & retrofit specs; ${ex.responseMethod.toLowerCase()} before ${cutoff}`
      : q.status === "closed_window"
        ? "Suppress outreach on this request; keep the account for future projects"
        : q.status === "needs_review"
          ? "Review: confirm the contractor's supplier deadline before outreach"
          : "Not eligible — missing a mandatory credential";

  const graphPath = await subgraphForNotice(deps.db, org, noticeNode(notice), supplierNode(org));
  return LeadRec.parse({
    id: leadId,
    projectId: project.id,
    projectTitle: project.title,
    projectNumber: project.number,
    ownerName: project.ownerName,
    contractorName: ex.bidder,
    scopes: [...new Set(matches.map((m) => m.scope))],
    qualification: q,
    score: s,
    evidenceStrength: ev,
    stage: existing?.stage ?? "matched",
    milestones: existing?.milestones ?? [],
    nextAction,
    segment: segmentFor(profile, ex.scopes),
    companyTier: companyTier(project.estimate),
    origin: notice.origin,
    updatedAt: iso(deps),
    project,
    contractor: { id: notice.contractorId, name: ex.bidder, domain: ex.bidderDomain },
    notice: { id: notice.id, title: src.title, version: notice.version, sourceUrl: src.url, isCurrent: notice.isCurrent, excerpt: ex.scopeExcerpt },
    scopeMatches,
    deadlines,
    contacts,
    requirements,
    responseMethod: ex.responseMethod,
    graphPath,
    noticeId: notice.id,
  });
}

export function toSummary(l: LeadRec): LeadSummary {
  return {
    id: l.id,
    projectId: l.projectId,
    projectTitle: l.projectTitle,
    projectNumber: l.projectNumber,
    ownerName: l.ownerName,
    contractorName: l.contractorName,
    scopes: l.scopes,
    qualification: l.qualification,
    score: l.score,
    evidenceStrength: l.evidenceStrength,
    stage: l.stage,
    milestones: l.milestones,
    nextAction: l.nextAction,
    segment: l.segment,
    companyTier: l.companyTier,
    origin: l.origin,
    updatedAt: l.updatedAt,
  };
}

export async function allLeads(deps: Deps, org: Org) {
  const leads = await listDocs(deps.db, org.id, "lead", LeadRec);
  const rank = { actionable: 0, needs_review: 1, closed_window: 2, disqualified: 3 } as const;
  return leads.sort((a, b) => rank[a.qualification.status] - rank[b.qualification.status] || b.score.total - a.score.total);
}

export async function requireLead(deps: Deps, org: Org, leadId: string) {
  const l = await getDoc(deps.db, org.id, "lead", leadId, LeadRec);
  if (!l) throw new ContractError("not_found", "Lead not found");
  return l;
}

export async function saveLead(deps: Deps, org: Org, l: LeadRec) {
  await putDoc(deps.db, org.id, "lead", l.id, l, iso(deps));
}

export async function leadDetail(deps: Deps, org: Org, leadId: string): Promise<LeadDetail> {
  const l = await requireLead(deps, org, leadId);
  const { noticeId: _n, ...rest } = l;
  const messages = (await listDocs(deps.db, org.id, "message", Message)).filter((m) => m.leadId === leadId).sort((a, b) => a.step - b.step);
  const entries = (await ledger(deps.db, org)).filter((e) => e.leadId === leadId);
  return {
    ...rest,
    messages,
    activity: await listActivity(deps.db, org, leadId),
    billing: { spent: -entries.filter((e) => e.status === "settled").reduce((s, e) => s + e.credits, 0), entries },
  };
}

/** Billable lead-specific graph evaluation: re-traverse + re-qualify under the given clock. */
export async function evaluateLead(deps: Deps, org: Org, leadId: string, body: { idempotencyKey: string; asOf?: string }) {
  await idempotent(deps, org, `evaluate:${body.idempotencyKey}`, async () => {
    const lead = await requireLead(deps, org, leadId);
    const profile = await getProfile(deps, org);
    const notice = await getDoc(deps.db, org.id, "notice", lead.noticeId, NoticeRec);
    if (!profile || !notice) throw new ContractError("conflict", "Lead evidence is missing; rerun discovery");
    const res = await reserve(deps, org, "graph_query_evaluated", { leadId, runId: null, eventId: `evt_eval_${body.idempotencyKey}` });
    try {
      const asOf = body.asOf ? toZonedIso(body.asOf) : iso(deps);
      const candidates = await matchCandidates(deps.db, org, supplierNode(org), noticeNode(notice));
      const rebuilt = candidates.length ? await buildLead(deps, org, profile, notice, asOf) : null;
      if (!rebuilt) throw new ContractError("conflict", "Graph traversal no longer matches this lead to the supplier's services");
      await saveLead(deps, org, rebuilt);
      const settled = await settle(deps, org, res, `Graph evaluation: ${candidates.length} service→scope paths`);
      await logActivity(deps, deps.db, org, {
        actor: rep(org),
        type: "lead_evaluated",
        leadId,
        summary: `Evaluated ${rebuilt.contractorName}: ${rebuilt.qualification.label} · score ${rebuilt.score.total} (${candidates.length} graph paths)`,
        billingEventId: settled.id,
      });
    } catch (e) {
      await release(deps, org, res, "Evaluation failed — not billed");
      throw e;
    }
    return true;
  });
  return leadDetail(deps, org, leadId);
}

export async function verifyContact(deps: Deps, org: Org, leadId: string, contactId: string, body: { idempotencyKey: string }) {
  const lead = await requireLead(deps, org, leadId);
  const contact = lead.contacts.find((c) => c.id === contactId);
  if (!contact) throw new ContractError("not_found", "Contact not found");
  if (!contact.email) throw new ContractError("bad_request", "No email published for this contact; verify the shared mailbox instead");
  if (lead.qualification.status !== "actionable") {
    throw new ContractError("conflict", `Lead is ${lead.qualification.label.toLowerCase()}; enrichment is suppressed`);
  }
  const email = contact.email;
  await idempotent(deps, org, `verify:${body.idempotencyKey}`, async () => {
    let res: Awaited<ReturnType<typeof reserve>>;
    try {
      res = await reserve(deps, org, "lead_enriched", { leadId, runId: null, eventId: `evt_enrich_${body.idempotencyKey}` });
    } catch (e) {
      if (e instanceof ContractError && e.code === "insufficient_credits") {
        await updateContact(deps, org, leadId, contactId, {
          status: "blocked",
          provider: null,
          checkedAt: iso(deps),
          score: null,
          note: `Blocked: ${e.message}`,
        });
        await logActivity(deps, deps.db, org, { actor: { kind: "system", name: "Credit gate" }, type: "credits_blocked", leadId, summary: `Enrichment blocked for ${email}: ${e.message}` });
      }
      throw e;
    }
    const r = await deps.enrich.verifyEmail(email).catch((err) => ({ status: "unknown" as const, score: null, note: String(err) }));
    const billable = r.status === "valid";
    const entry = billable ? await settle(deps, org, res, `Verified ${email}`) : null;
    if (!billable) await release(deps, org, res, `Not billable: ${r.status}`);
    await updateContact(deps, org, leadId, contactId, {
      status: r.status,
      provider: deps.enrich.kind === "live" ? "Hunter.io" : "Hunter.io (fake)",
      checkedAt: iso(deps),
      score: r.score,
      note: r.note,
    });
    await logActivity(deps, deps.db, org, {
      actor: rep(org),
      type: "contact_verified",
      leadId,
      summary: `${email}: ${r.status}${billable ? " — 3 credits" : " — not billed"}`,
      billingEventId: entry?.id ?? null,
    });
    return true;
  });
  return leadDetail(deps, org, leadId);
}

async function updateContact(deps: Deps, org: Org, leadId: string, contactId: string, v: Contact["verification"]) {
  const lead = await requireLead(deps, org, leadId);
  lead.contacts = lead.contacts.map((c) => (c.id === contactId ? { ...c, verification: v } : c));
  await saveLead(deps, org, lead);
}

export async function setStage(deps: Deps, org: Org, leadId: string, stage: Stage, actor: Parameters<typeof logActivity>[3]["actor"], summary: string) {
  const lead = await requireLead(deps, org, leadId);
  if (lead.stage === stage) return lead;
  const from = lead.stage;
  lead.stage = stage;
  lead.updatedAt = iso(deps);
  await saveLead(deps, org, lead);
  await logActivity(deps, deps.db, org, { actor, type: "stage_changed", leadId, summary: `${from} → ${stage}: ${summary}` });
  return lead;
}

export async function moveLead(deps: Deps, org: Org, leadId: string, req: MoveLeadRequest) {
  if (req.stage) await setStage(deps, org, leadId, req.stage, rep(org), req.note ?? "moved by rep");
  if (req.milestone) {
    const lead = await requireLead(deps, org, leadId);
    if (!lead.milestones.some((m) => m.key === req.milestone)) {
      lead.milestones.push({ key: req.milestone, at: iso(deps) });
      await saveLead(deps, org, lead);
      await logActivity(deps, deps.db, org, { actor: rep(org), type: "milestone", leadId, summary: `Milestone: ${req.milestone.replace("_", " ")}${req.note ? ` — ${req.note}` : ""}` });
    }
  }
  return leadDetail(deps, org, leadId);
}

export async function pipeline(deps: Deps, org: Org): Promise<Pipeline> {
  const leads = (await allLeads(deps, org)).filter((l) => l.qualification.status === "actionable" || l.stage !== "matched");
  return {
    columns: STAGE_ORDER.map((stage) => ({ stage, leads: leads.filter((l) => l.stage === stage).map(toSummary) })),
    activity: await listActivity(deps.db, org, undefined, 60),
  };
}

export { AGENTS };
