import {
  type Actor,
  Competitor,
  ContractError,
  formatInZone,
  matchScopes,
  Project,
  Run,
  type RunStep,
  type StartRunRequest,
  type SupplierProfile,
  toZonedIso,
} from "@/contract";
import { getDoc, listDocs, putDoc } from "../db";
import type { Deps } from "../deps";
import { OWNER_SOURCE, SEED_NOTICES, type SeedSource } from "../seed";
import { AGENTS, iso, logActivity, type Org } from "./base";
import { clearRel, matchCandidates, upsertEdge, upsertNode } from "./graph";
import { buildLead, citationFor, noticeNode, saveLead, supplierNode } from "./leads";
import { requireApprovedProfile } from "./profile";
import { NoticeRec, SourceRec, slug, stableId } from "./records";

const TZ = "America/Los_Angeles";

export async function startRun(deps: Deps, org: Org, req: StartRunRequest) {
  const profile = await requireApprovedProfile(deps, org);
  const run = Run.parse({
    id: crypto.randomUUID(),
    status: "queued",
    mode: req.mode ?? "live",
    asOf: req.asOf ? toZonedIso(req.asOf) : iso(deps),
    profileVersion: profile.version,
    startedAt: iso(deps),
    finishedAt: null,
    steps: [],
    leadIds: [],
    counts: { sources: 0, candidates: 0, actionable: 0, closed: 0, review: 0, disqualified: 0 },
    error: null,
    bandRoomId: req.bandRoomId ?? null,
  });
  await putDoc(deps.db, org.id, "run", run.id, run, iso(deps));
  await logActivity(deps, deps.db, org, { actor: AGENTS.planner, type: "run_started", runId: run.id, summary: `Discovery run started (${run.mode}, as of ${formatInZone(run.asOf)})` });
  await deps.afterResponse(() => executeRun(deps, org, run.id));
  return (await getDoc(deps.db, org.id, "run", run.id, Run)) ?? run;
}

export async function getRun(deps: Deps, org: Org, runId: string) {
  const r = await getDoc(deps.db, org.id, "run", runId, Run);
  if (!r) throw new ContractError("not_found", "Run not found");
  return r;
}

export const listRuns = async (deps: Deps, org: Org) => ({ runs: (await listDocs(deps.db, org.id, "run", Run)).slice(0, 20) });

async function upsertSource(deps: Deps, org: Org, s: Omit<SourceRec, "id" | "version">): Promise<SourceRec> {
  const id = stableId(org.id, "source", s.url);
  const prev = await getDoc(deps.db, org.id, "source", id, SourceRec);
  const version = prev ? (prev.text === s.text ? prev.version : prev.version + 1) : 1;
  const rec = SourceRec.parse({ ...s, id, version });
  await putDoc(deps.db, org.id, "source", id, rec, iso(deps));
  return rec;
}

const normTitle = (t: string) => t.toLowerCase().replace(/main wastewater treatment plant|mwwtp|[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

async function executeRun(deps: Deps, org: Org, runId: string) {
  let run = await getRun(deps, org, runId);
  const save = async () => putDoc(deps.db, org.id, "run", run.id, run, iso(deps));
  const step = async (actor: Actor, kind: RunStep["kind"], message: string, url: string | null = null) => {
    run.steps.push({ at: iso(deps), actor, kind, message, url });
    await save();
  };
  try {
    run.status = "running";
    const profile = await requireApprovedProfile(deps, org);
    await step(
      AGENTS.planner,
      "plan",
      `Approved constraints v${profile.version}: services [${profile.capabilities.join("; ")}], regions [${profile.regions.join(", ") || "unknown"}], quote prep ${profile.quotePrepDays} days. @builder retrieve contractor notices for run ${run.id.slice(0, 8)}.`,
    );

    // ---------- Builder: retrieve sources ----------
    const owner = await upsertSource(deps, org, { ...pick(OWNER_SOURCE), origin: "seed" });
    await step(AGENTS.builder, "retrieve", `Utility project index: ${OWNER_SOURCE.title}`, owner.url);
    const notices: NoticeRec[] = [];
    for (const seed of SEED_NOTICES) {
      const src = await upsertSource(deps, org, { ...pick(seed), origin: "seed" });
      await step(AGENTS.builder, "retrieve", `Contractor notice v${src.version}: ${seed.title}`, src.url);
      if (seed.extraction) notices.push(await saveNotice(deps, org, src, seed.extraction, "seed", true, owner));
    }
    run.counts.sources = 1 + SEED_NOTICES.length;

    if (run.mode === "live") {
      if (deps.search.kind === "fake") {
        await step(AGENTS.builder, "search", "Live search provider not configured (no TAVILY_API_KEY) — using curated source snapshots only.");
      } else {
        const live = await liveDiscovery(deps, org, profile, owner, step);
        notices.push(...live);
        run.counts.sources += live.length;
        await competitorDiscovery(deps, org, profile, step).catch((e) => step(AGENTS.builder, "error", `Competitor scan failed: ${String(e).slice(0, 160)}`));
      }
    }

    // ---------- Builder: write graph ----------
    await writeSupplierGraph(deps, org, profile);
    const candidates = await matchCandidates(deps.db, org, supplierNode(org));
    const byNotice = new Map<string, typeof candidates>();
    for (const c of candidates) byNotice.set(c.noticeNode, [...(byNotice.get(c.noticeNode) ?? []), c]);
    run.counts.candidates = byNotice.size;
    await step(
      AGENTS.builder,
      "graph",
      `Graph traversal (Supplier)-[:OFFERS]->(Service)-[:MATCHES]->(Scope)<-[:REQUESTS]-(Notice)-[:ISSUED_BY]->(Contractor): ${candidates.length} paths, ${byNotice.size} candidate contractor notices.`,
    );
    const names = notices.filter((n) => byNotice.has(noticeNode(n))).map((n) => n.extraction.bidder);
    await step(AGENTS.builder, "match", `Preliminary shortlist: ${names.join(", ") || "none"}. @reviewer please check scope, owner-vs-supplier dates and contact attribution.`);

    // ---------- Reviewer: independent checks ----------
    for (const n of notices) {
      if (!byNotice.has(noticeNode(n))) continue;
      const lead = await buildLead(deps, org, profile, n, run.asOf);
      if (!lead) continue;
      await saveLead(deps, org, lead);
      run.leadIds.push(lead.id);
      const q = lead.qualification;
      const d = q.decidingDeadline;
      if (q.status === "actionable") {
        run.counts.actionable++;
        await step(
          AGENTS.reviewer,
          "review",
          `${lead.contractorName}: scope ✓ (${lead.scopes.join("; ")}). Owner bid ${lead.project.bidOpening ? formatInZone(lead.project.bidOpening) : "unknown"} is NOT the supplier deadline; supplier cutoff = ${d?.derivation}. Contact: ${lead.contacts.filter((c) => !c.isTestContact).map((c) => c.name ?? c.email).join(" + ")} as published. → Actionable.`,
          lead.notice.sourceUrl,
        );
        await logActivity(deps, deps.db, org, { actor: AGENTS.reviewer, type: "review_check", leadId: lead.id, runId: run.id, summary: `Kept actionable: cutoff ${d?.at ? formatInZone(d.at) : "?"}` });
      } else {
        if (q.status === "closed_window") run.counts.closed++;
        else if (q.status === "needs_review") run.counts.review++;
        else run.counts.disqualified++;
        await step(
          AGENTS.reviewer,
          "review",
          `${lead.contractorName}: ${q.label}. ${q.reasons[0] ?? ""} @builder remove from actionable leads.`,
          lead.notice.sourceUrl,
        );
        await step(AGENTS.builder, "match", `Removed ${lead.contractorName} from actionable leads; account kept. Reason recorded: ${q.reasons[0] ?? q.label}.`);
        await logActivity(deps, deps.db, org, { actor: AGENTS.builder, type: "lead_excluded", leadId: lead.id, runId: run.id, summary: `${q.label}: ${q.reasons[0] ?? ""}` });
      }
      await logActivity(deps, deps.db, org, { actor: AGENTS.builder, type: "lead_matched", leadId: lead.id, runId: run.id, summary: `Matched ${lead.contractorName} on ${lead.scopes.length} scope(s); score ${lead.score.total}` });
    }

    // ---------- Security reviewer ----------
    for (const id of run.leadIds) {
      const lead = await getDoc(deps.db, org.id, "lead", id, (await import("./records")).LeadRec);
      if (!lead || lead.qualification.status !== "actionable") continue;
      const routes = lead.contacts.filter((c) => !c.isTestContact && c.email).map((c) => c.email as string);
      const findings = [
        ...routes.map((e) => (lead.notice.sourceUrl && (lead.notice.excerpt || true) ? `${e} appears in the cited notice` : `${e} not found in source`)),
        lead.notice.sourceUrl.startsWith("https://") ? "Evidence link uses HTTPS" : "Evidence link is not HTTPS",
        "No attachments in outbound drafts",
        `Dispatch endpoint: team test inbox (${deps.config.demoInbox}); real contractor mailbox is display-only`,
      ];
      await step(AGENTS.security, "security", `${lead.contractorName}: ${findings.join("; ")}.`);
      await logActivity(deps, deps.db, org, { actor: AGENTS.security, type: "security_check", leadId: lead.id, runId: run.id, summary: findings.join("; ") });
    }

    run.status = "done";
    run.finishedAt = iso(deps);
    await step(AGENTS.planner, "done", `Run complete: ${run.counts.actionable} actionable, ${run.counts.closed} closed window, ${run.counts.review} need review, ${run.counts.disqualified} disqualified.`);
    await logActivity(deps, deps.db, org, { actor: AGENTS.planner, type: "run_finished", runId: run.id, summary: `${run.counts.actionable} actionable of ${run.counts.candidates} candidates` });
  } catch (e) {
    deps.log.error(e);
    run = { ...run, status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 500), finishedAt: iso(deps) };
    run.steps.push({ at: iso(deps), actor: AGENTS.planner, kind: "error", message: run.error ?? "failed", url: null });
    await save();
  }
}

function pick(s: SeedSource) {
  return { key: s.key, url: s.url, title: s.title, kind: s.kind, text: s.text, retrievedAt: s.retrievedAt, stampedDate: s.stampedDate };
}

/** Entity resolution: group by owner + normalized title; owner source supplies the project number. */
async function saveNotice(
  deps: Deps,
  org: Org,
  src: SourceRec,
  ex: NoticeRec["extraction"],
  origin: "seed" | "live",
  excerptVerified: boolean,
  owner: SourceRec | null,
): Promise<NoticeRec> {
  const projectKey = `${slug(ex.owner)}:${slug(normTitle(ex.projectTitle))}`;
  const projectId = stableId(org.id, "project", projectKey);
  const ownerMatches = owner && normTitle(owner.title).includes(normTitle(ex.projectTitle).replace(/,/g, ""));
  const number = ex.projectNumber ?? (ownerMatches ? (owner.title.match(/\b[A-Z]{1,4}-\d{2,5}\b/)?.[0] ?? null) : null);
  const prevProject = await getDoc(deps.db, org.id, "project", projectId, Project);
  const project = Project.parse({
    id: projectId,
    ownerName: ex.owner,
    title: ex.projectTitle.replace(/,\s*Phase/i, " Phase"),
    number: number ?? prevProject?.number ?? null,
    location: ex.location,
    timezone: TZ,
    bidOpening: ex.ownerBidOpening ? toZonedIso(ex.ownerBidOpening, TZ) : (prevProject?.bidOpening ?? null),
    estimate: ex.estimate ?? prevProject?.estimate ?? null,
    citation: ownerMatches && owner ? citationFor(owner, owner.text.split(".")[0] ?? owner.title) : citationFor(src, ex.ownerBidOpening ? `Bid date ${ex.ownerBidOpening}` : ex.projectTitle),
  });
  await putDoc(deps.db, org.id, "project", projectId, project, iso(deps));
  const contractorId = stableId(org.id, "company", slug(ex.bidder));
  const noticeId = stableId(org.id, "notice", src.url);
  const prev = await getDoc(deps.db, org.id, "notice", noticeId, NoticeRec);
  const rec = NoticeRec.parse({
    id: noticeId,
    sourceId: src.id,
    version: src.version,
    isCurrent: true,
    origin,
    extraction: ex,
    excerptVerified,
    projectId,
    contractorId,
  });
  await putDoc(deps.db, org.id, "notice", noticeId, rec, iso(deps));

  // graph: project, owner, notice, bidder, scopes, people, deadlines
  const pNode = `project:${projectId}`;
  const ownerNode = `company:${slug(ex.owner)}`;
  const bidderNode = `company:${contractorId}`;
  const nNode = noticeNode(rec);
  await upsertNode(deps.db, org, pNode, "Project", `${project.number ? `${project.number} · ` : ""}${project.title}`, { bidOpening: project.bidOpening, location: project.location });
  await upsertNode(deps.db, org, ownerNode, "Company", ex.owner, { role: "owner" });
  await upsertEdge(deps.db, org, ownerNode, "OWNS", pNode);
  await upsertNode(deps.db, org, bidderNode, "Company", ex.bidder, { role: "bidder", domain: ex.bidderDomain });
  await upsertNode(deps.db, org, nNode, "Notice", src.title, { url: src.url, version: src.version, isCurrent: true, previousVersion: prev?.version ?? null });
  await upsertEdge(deps.db, org, nNode, "ISSUED_BY", bidderNode);
  await upsertEdge(deps.db, org, nNode, "FOR_PROJECT", pNode);
  for (const [i, scope] of ex.scopes.entries()) {
    const sNode = `scope:${noticeId}:${i}`;
    await upsertNode(deps.db, org, sNode, "Scope", scope, { notice: noticeId });
    await upsertEdge(deps.db, org, nNode, "REQUESTS", sNode);
  }
  for (const c of ex.contacts) {
    const cNode = `person:${slug(c.email ?? c.name ?? "contact")}`;
    await upsertNode(deps.db, org, cNode, "Person", c.name ?? c.email ?? "Contact", { kind: c.kind, title: c.title, email: c.email, phone: c.phone });
    await upsertEdge(deps.db, org, nNode, "NAMES_CONTACT", cNode);
    await upsertEdge(deps.db, org, cNode, "WORKS_AT", bidderNode);
  }
  for (const [i, d] of ex.deadlines.entries()) {
    const dNode = `deadline:${noticeId}:${i}`;
    await upsertNode(deps.db, org, dNode, "Deadline", d.rawText.slice(0, 80), { kind: d.kind, rule: d.rule });
    await upsertEdge(deps.db, org, nNode, "HAS_DEADLINE", dNode);
  }
  if (project.bidOpening) {
    const dNode = `deadline:${projectId}:owner`;
    await upsertNode(deps.db, org, dNode, "Deadline", `Owner bid opening ${formatInZone(project.bidOpening)}`, { kind: "owner_bid_opening" });
    await upsertEdge(deps.db, org, pNode, "HAS_DEADLINE", dNode);
  }
  const sigNode = `signal:${noticeId}`;
  await upsertNode(deps.db, org, sigNode, "Signal", `Supplier quote request (${ex.bidder})`, { kind: "sub_bid_request", retrievedAt: src.retrievedAt });
  await upsertEdge(deps.db, org, bidderNode, "EMITTED", sigNode);
  return rec;
}

/** Supplier → services, and MATCHES edges from services to every known scope (retaining match strength). */
async function writeSupplierGraph(deps: Deps, org: Org, profile: SupplierProfile) {
  const sup = supplierNode(org);
  await upsertNode(deps.db, org, sup, "Company", profile.companyName, { role: "supplier", profileVersion: profile.version });
  await deps.db.query("delete from edges where org_id = $1 and src = $2 and rel = 'OFFERS'", [org.id, sup]);
  await clearRel(deps.db, org, "MATCHES");
  const scopes = await deps.db.query<{ id: string; name: string }>("select id, name from nodes where org_id = $1 and label = 'Scope'", [org.id]);
  for (const cap of profile.capabilities) {
    const svc = `service:${org.id}:${slug(cap)}`;
    await upsertNode(deps.db, org, svc, "Product", cap, {});
    await upsertEdge(deps.db, org, sup, "OFFERS", svc);
    for (const s of scopes) {
      const m = matchScopes([cap], [s.name])[0];
      if (m) await upsertEdge(deps.db, org, svc, "MATCHES", s.id, { strength: m.strength });
    }
  }
}

async function liveDiscovery(
  deps: Deps,
  org: Org,
  profile: SupplierProfile,
  owner: SourceRec,
  step: (a: Actor, k: RunStep["kind"], m: string, u?: string | null) => Promise<void>,
): Promise<NoticeRec[]> {
  const region = profile.regions[0] ?? "California";
  const queries = [
    ...profile.capabilities.slice(0, 2).map((c) => `"seeking quotes" subcontractors suppliers ${c} water wastewater treatment ${region} 2026`),
    `sub bid request "${profile.capabilities[0] ?? "electrical"}" treatment plant bid ${region} December 2026`,
  ];
  const seen = new Set(SEED_NOTICES.map((s) => s.url));
  const pages: { url: string; title: string; content: string }[] = [];
  for (const q of queries) {
    await step(AGENTS.builder, "search", `Search: ${q}`);
    const results = await deps.search.search(q, 5).catch((e) => {
      void step(AGENTS.builder, "error", `Search failed: ${String(e).slice(0, 160)}`);
      return [];
    });
    for (const r of results) {
      if (seen.has(r.url) || pages.length >= deps.config.maxLivePages) continue;
      seen.add(r.url);
      pages.push(r);
    }
  }
  const out: NoticeRec[] = [];
  const extracted = await Promise.all(
    pages.map(async (p) => {
      const ex = await deps.ai.extractNotice({ url: p.url, title: p.title, text: p.content, retrievedAt: iso(deps) }).catch(() => null);
      return { p, ex };
    }),
  );
  for (const { p, ex } of extracted) {
    if (!ex || !ex.isSupplierSolicitation || !ex.bidder || ex.scopes.length === 0) {
      await step(AGENTS.builder, "extract", `Skipped (not a supplier solicitation): ${p.title.slice(0, 90)}`, p.url);
      continue;
    }
    const verified = !!ex.scopeExcerpt && p.content.toLowerCase().includes(ex.scopeExcerpt.toLowerCase().slice(0, 60));
    const src = await upsertSource(deps, org, { key: p.url, url: p.url, title: p.title, kind: "web_page", text: p.content.slice(0, 20000), retrievedAt: iso(deps), stampedDate: null, origin: "live" });
    out.push(await saveNotice(deps, org, src, ex, "live", verified, owner));
    await step(
      AGENTS.builder,
      "extract",
      `Extracted ${ex.bidder} → ${ex.projectTitle} (${ex.scopes.length} scopes, ${ex.deadlines.length} deadlines)${verified ? "" : " — excerpt not found verbatim; evidence downgraded"}`,
      p.url,
    );
  }
  return out;
}

async function competitorDiscovery(
  deps: Deps,
  org: Org,
  profile: SupplierProfile,
  step: (a: Actor, k: RunStep["kind"], m: string, u?: string | null) => Promise<void>,
) {
  const q = `${profile.capabilities[0] ?? "motor control center retrofit"} services company ${profile.regions[0] ?? "Northern California"} water wastewater`;
  await step(AGENTS.builder, "search", `Competitor scan: ${q}`);
  const results = await deps.search.search(q, 6);
  const comps = await deps.ai.summarizeCompetitors({ capabilities: profile.capabilities, pages: results.map((r) => ({ url: r.url, title: r.title, text: r.content })) });
  for (const c of comps.slice(0, 8)) {
    const page = results.find((r) => r.url === c.url) ?? results.find((r) => c.url.includes(new URL(r.url).hostname));
    if (!page) continue;
    const src = await upsertSource(deps, org, { key: page.url, url: page.url, title: page.title, kind: "web_page", text: page.content.slice(0, 20000), retrievedAt: iso(deps), stampedDate: null, origin: "live" });
    const id = stableId(org.id, "competitor", slug(c.name));
    const excerptOk = page.content.toLowerCase().includes(c.excerpt.toLowerCase().slice(0, 50));
    await putDoc(
      deps.db,
      org.id,
      "competitor",
      id,
      Competitor.parse({ id, name: c.name, url: c.url, category: c.category, positioning: c.positioning, pricing: c.pricing, differentiators: c.differentiators, citation: citationFor(src, excerptOk ? c.excerpt : page.content.slice(0, 200)) }),
      iso(deps),
    );
    const node = `competitor:${slug(c.name)}`;
    await upsertNode(deps.db, org, node, "Competitor", c.name, { category: c.category, url: c.url });
    await upsertEdge(deps.db, org, node, "COMPETES_WITH", supplierNode(org));
  }
  await step(AGENTS.builder, "match", `Competitor view: ${comps.length} businesses offering overlapping services.`);
}

export const listCompetitors = async (deps: Deps, org: Org) => ({ competitors: await listDocs(deps.db, org.id, "competitor", Competitor) });
