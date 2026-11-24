import {
  approvalHash,
  ContractError,
  type DecideMessageRequest,
  type DraftRequest,
  formatInZone,
  Message,
  type ReviseMessageRequest,
} from "@/contract";
import { getDoc, listDocs, putDoc } from "../db";
import type { Deps } from "../deps";
import { AGENTS, idempotent, iso, logActivity, type Org, release, rep, reserve, settle } from "./base";
import { upsertEdge, upsertNode } from "./graph";
import { allLeads, requireLead, setStage, supplierNode, toSummary } from "./leads";
import { slug } from "./records";
import { getProfile } from "./profile";

async function requireMessage(deps: Deps, org: Org, id: string) {
  const m = await getDoc(deps.db, org.id, "message", id, Message);
  if (!m) throw new ContractError("not_found", "Message not found");
  return m;
}
const save = (deps: Deps, org: Org, m: Message) => putDoc(deps.db, org.id, "message", m.id, Message.parse(m), iso(deps));

function securityCheck(body: string, groundedOn: string[], recipient: string, demoInbox: string) {
  const findings: string[] = [];
  const urls = body.match(/https?:\/\/\S+/g) ?? [];
  const hosts = groundedOn.map((u) => new URL(u).hostname);
  for (const u of urls) {
    if (!u.startsWith("https://")) findings.push(`Insecure link: ${u}`);
    else if (!hosts.some((h) => u.includes(h))) findings.push(`Link not in approved evidence: ${u}`);
  }
  if (recipient.toLowerCase() !== demoInbox.toLowerCase()) findings.push(`Destination ${recipient} is not the team-controlled test inbox`);
  return { passed: findings.length === 0, findings: findings.length ? findings : ["Links, destination and attachments OK (no attachments)"] };
}

export const VALUE_PROPS = {
  A: "Scope match: we do exactly the equipment items listed in your request",
  B: "Local track record: Northern California water-plant retrofits delivered on schedule",
} as const;

/** Persona rules by the recipient's role (tone, max length, CTA). */
export function personaFor(title: string | null, kind: "person" | "shared_mailbox", channel: "email" | "linkedin"): string {
  const t = (title ?? "").toLowerCase();
  const len = channel === "linkedin" ? "max 280 characters" : "max 110 words";
  if (kind === "shared_mailbox") {
    return `Estimating mailbox: formal, reference their solicitation form and project name, ${len}, CTA = request drawings/specs and confirm the form route`;
  }
  if (/estimat|coordinator/.test(t)) return `Estimator: concise and technical, name the exact scope items, ${len}, CTA = share electrical drawings and retrofit specs`;
  if (/purchas|procure|buyer/.test(t)) return `Purchasing: plain business tone, emphasize quote turnaround, ${len}, CTA = confirm quote format and due date`;
  if (/project manager/.test(t)) return `Project manager: schedule-focused, mention retrofit sequencing, ${len}, CTA = 15-minute scope call`;
  return `Estimating contact: concise, specific scope, ${len}, CTA = share drawings and specs`;
}

const leadMessages = async (deps: Deps, org: Org, leadId: string) =>
  (await listDocs(deps.db, org.id, "message", Message)).filter((m) => m.leadId === leadId);

export async function draftMessage(deps: Deps, org: Org, leadId: string, req: DraftRequest) {
  const existing = await leadMessages(deps, org, leadId);
  return createDraft(deps, org, leadId, {
    channel: req.channel ?? "email",
    variant: req.variant ?? "A",
    step: existing.length + 1,
    sendAfterDays: 0,
    followUp: false,
  });
}

/** Three-touch sequence: email (day 0) → LinkedIn note (day 1) → follow-up email (day 3). Each touch needs its own approval. */
export async function draftSequence(deps: Deps, org: Org, leadId: string, req: { variant?: "A" | "B" }) {
  const variant = req.variant ?? "A";
  const base = (await leadMessages(deps, org, leadId)).length;
  const plan = [
    { channel: "email" as const, sendAfterDays: 0, followUp: false },
    { channel: "linkedin" as const, sendAfterDays: 1, followUp: false },
    { channel: "email" as const, sendAfterDays: 3, followUp: true },
  ];
  const messages = await Promise.all(plan.map((p, i) => createDraft(deps, org, leadId, { ...p, variant, step: base + i + 1 })));
  return { messages };
}

/** Everything awaiting a human decision or send, across leads. */
export async function queue(deps: Deps, org: Org) {
  const leads = new Map((await allLeads(deps, org)).map((l) => [l.id, l]));
  const items = (await listDocs(deps.db, org.id, "message", Message))
    .filter((m) => m.status === "draft" || m.status === "approved")
    .sort((a, b) => a.leadId.localeCompare(b.leadId) || a.step - b.step)
    .flatMap((m) => {
      const l = leads.get(m.leadId);
      return l ? [{ message: m, lead: toSummary(l) }] : [];
    });
  return { items };
}

/** Refresh calls this when a lead's evidence changes: unsent drafts/approvals become stale and unsendable. */
export async function markStale(deps: Deps, org: Org, leadId: string, reason: string) {
  let n = 0;
  for (const m of await leadMessages(deps, org, leadId)) {
    if ((m.status === "draft" || m.status === "approved") && m.staleReason !== reason) {
      await save(deps, org, { ...m, staleReason: reason, updatedAt: iso(deps) });
      n++;
    }
  }
  return n;
}

async function createDraft(
  deps: Deps,
  org: Org,
  leadId: string,
  opts: { channel: "email" | "linkedin"; variant: "A" | "B"; step: number; sendAfterDays: number; followUp: boolean },
): Promise<Message> {
  const lead = await requireLead(deps, org, leadId);
  if (lead.qualification.status !== "actionable") {
    throw new ContractError("conflict", `Outreach suppressed: ${lead.qualification.label}. ${lead.qualification.reasons[0] ?? ""}`);
  }
  const profile = await getProfile(deps, org);
  if (!profile) throw new ContractError("conflict", "No supplier profile");
  const person = lead.contacts.find((c) => !c.isTestContact && c.kind === "person");
  const mailbox = lead.contacts.find((c) => !c.isTestContact && c.email);
  const addressed = person ?? mailbox;
  const channel = opts.channel;
  const variant = opts.variant;
  const persona = personaFor(addressed?.title ?? null, addressed?.kind ?? "person", channel);
  const valueProp = VALUE_PROPS[variant];
  const cutoffText = lead.qualification.decidingDeadline?.at ? formatInZone(lead.qualification.decidingDeadline.at) : "published";
  const draft = await deps.ai.draft({
    persona,
    valueProp,
    trigger: `${lead.contractorName} is collecting supplier quotes for its bid on ${lead.ownerName}'s ${lead.projectNumber ? `${lead.projectNumber} ` : ""}project; the supplier cutoff is ${cutoffText}`,
    followUp: opts.followUp,
    supplierName: profile.companyName,
    capabilities: profile.capabilities,
    pastWins: profile.pastWins,
    contractorName: lead.contractorName,
    projectTitle: lead.projectTitle,
    ownerName: lead.ownerName,
    recipientName: person?.name ?? null,
    recipientTitle: person?.title ?? null,
    matchedScopes: lead.scopes,
    responseMethod: lead.responseMethod,
    cutoffText: lead.qualification.decidingDeadline?.at ? formatInZone(lead.qualification.decidingDeadline.at) : "published",
    variant,
    channel,
    step: opts.step,
  });
  if (channel === "linkedin" && draft.body.length > 280) {
    // enforce the persona's length rule: keep whole sentences up to 280 chars
    const sentences = draft.body.match(/[^.!?]+[.!?]+/g) ?? [draft.body];
    let out = "";
    for (const x of sentences) if ((out + x).trim().length <= 280) out += x;
    draft.body = (out.trim() || draft.body.slice(0, 277).trimEnd() + "…").trim();
  }
  const recipient = deps.config.demoInbox;
  const groundedOn = [lead.notice.sourceUrl, ...lead.scopeMatches.map((s) => s.citation.url)].filter((v, i, a) => a.indexOf(v) === i);
  const route = [mailbox?.email, person ? `Attn: ${person.name}${person.title ? ` (${person.title})` : ""}` : null].filter(Boolean).join(" · ");
  const m: Message = {
    id: crypto.randomUUID(),
    leadId,
    step: opts.step,
    channel,
    variant,
    revision: 1,
    subject: draft.subject,
    body: draft.body,
    recipient,
    recipientLabel: `${route || lead.contractorName} — demo delivery to team test inbox`,
    status: "draft",
    approval: null,
    rejection: null,
    delivery: null,
    groundedOn,
    securityCheck: securityCheck(draft.body, groundedOn, recipient, deps.config.demoInbox),
    sendAfterDays: opts.sendAfterDays,
    valueProp,
    persona,
    staleReason: null,
    createdBy: AGENTS.builder,
    updatedAt: iso(deps),
  };
  await save(deps, org, m);
  await logActivity(deps, deps.db, org, {
    actor: AGENTS.builder,
    type: "draft_created",
    leadId,
    channel,
    variant,
    summary: `Drafted ${channel} step ${m.step} (day ${m.sendAfterDays}, variant ${variant}: ${valueProp.split(":")[0]}): "${m.subject}"`,
  });
  await logActivity(deps, deps.db, org, { actor: AGENTS.security, type: "security_check", leadId, channel, summary: m.securityCheck.findings.join("; ") });
  return m;
}

export async function reviseMessage(deps: Deps, org: Org, id: string, req: ReviseMessageRequest) {
  const m = await requireMessage(deps, org, id);
  if (m.status === "sent") throw new ContractError("conflict", "Already sent; draft a follow-up instead");
  const next: Message = {
    ...m,
    ...req,
    revision: m.revision + 1,
    status: "draft",
    approval: null,
    rejection: null,
    securityCheck: securityCheck(req.body, m.groundedOn, req.recipient, deps.config.demoInbox),
    staleReason: null,
    createdBy: rep(org),
    updatedAt: iso(deps),
  };
  await save(deps, org, next);
  await logActivity(deps, deps.db, org, {
    actor: rep(org),
    type: "draft_revised",
    leadId: m.leadId,
    channel: next.channel,
    variant: next.variant,
    summary: `Rep edited revision ${next.revision}${m.status === "approved" ? " — previous approval invalidated" : ""}`,
  });
  return next;
}

export async function decideMessage(deps: Deps, org: Org, id: string, req: DecideMessageRequest) {
  const m = await requireMessage(deps, org, id);
  if (m.status !== "draft") throw new ContractError("conflict", `Message is ${m.status}; only drafts can be approved or rejected`);
  if (m.staleReason && req.decision === "approve") throw new ContractError("conflict", `Draft is stale: ${m.staleReason}. Edit or redraft it.`);
  if (req.revision !== m.revision) throw new ContractError("conflict", `You reviewed revision ${req.revision}; current is ${m.revision}`);
  const hash = approvalHash(m);
  if (req.hash !== hash) throw new ContractError("conflict", "The message changed since you reviewed it; review again");
  const next: Message =
    req.decision === "approve"
      ? { ...m, status: "approved", approval: { hash, revision: m.revision, by: rep(org), at: iso(deps) }, updatedAt: iso(deps) }
      : { ...m, status: "rejected", rejection: { reason: req.reason ?? "", by: rep(org), at: iso(deps) }, updatedAt: iso(deps) };
  await save(deps, org, next);
  await logActivity(deps, deps.db, org, {
    actor: rep(org),
    type: req.decision === "approve" ? "message_approved" : "message_rejected",
    leadId: m.leadId,
    channel: m.channel,
    variant: m.variant,
    summary: req.decision === "approve" ? `Approved revision ${m.revision} to ${m.recipient} (hash ${hash.slice(0, 8)})` : `Rejected: ${req.reason}`,
  });
  return next;
}

export async function sendMessage(deps: Deps, org: Org, id: string, body: { idempotencyKey: string }) {
  await idempotent(deps, org, `send:${id}`, async () => {
    const m = await requireMessage(deps, org, id);
    if (m.status === "sent") return true;
    if (m.staleReason) throw new ContractError("conflict", `Not sent: ${m.staleReason}`);
    if (m.status !== "approved" || !m.approval) {
      throw new ContractError("approval_required", m.status === "rejected" ? "Rejected messages cannot be sent" : "A rep must approve this exact revision before it is sent");
    }
    if (m.approval.hash !== approvalHash(m) || m.approval.revision !== m.revision) {
      throw new ContractError("approval_required", "Approval does not match the current revision; approve again");
    }
    const lead = await requireLead(deps, org, m.leadId);
    if (lead.qualification.status !== "actionable") throw new ContractError("conflict", `Outreach suppressed: ${lead.qualification.label}`);
    const res = await reserve(deps, org, "outreach_sent", { leadId: m.leadId, runId: null, eventId: `evt_send_${m.id}_r${m.revision}` });
    try {
      let delivery: NonNullable<Message["delivery"]>;
      if (m.channel === "linkedin") {
        delivery = { provider: "LinkedIn (manual handoff)", providerMessageId: null, mode: "manual_handoff", at: iso(deps), note: "Copied for manual send; no LinkedIn API delivery" };
      } else {
        const replyTo = deps.config.inboundDomain ? `reply+${m.id}@${deps.config.inboundDomain}` : null;
        const r = await deps.mail.send({ to: m.recipient, subject: m.subject, text: m.body, replyTo, tag: `${m.id}-r${m.revision}` });
        delivery = {
          provider: deps.mail.kind === "live" ? "Resend" : "Simulated mail provider",
          providerMessageId: r.providerMessageId,
          mode: deps.mail.kind === "live" ? "live" : "simulated",
          at: iso(deps),
          note: `Delivered to ${m.recipient}${replyTo ? `; replies route via ${replyTo}` : ""}`,
        };
      }
      const settled = await settle(deps, org, res, `Sent ${m.channel} step ${m.step}`);
      await save(deps, org, { ...m, status: "sent", delivery, updatedAt: iso(deps) });
      await logActivity(deps, deps.db, org, {
        actor: rep(org),
        type: "message_sent",
        leadId: m.leadId,
        channel: m.channel,
        variant: m.variant,
        billingEventId: settled.id,
        summary: `${delivery.mode === "live" ? "Sent" : delivery.mode === "manual_handoff" ? "Handed off" : "Sent (simulated)"} "${m.subject}" via ${delivery.provider}`,
      });
      await graphTouch(deps, org, lead, m, "CONTACTED_VIA", { channel: m.channel, at: delivery.at, mode: delivery.mode });
      if (lead.stage === "matched") await setStage(deps, org, m.leadId, "contacted", rep(org), "approved outreach accepted by provider");
    } catch (e) {
      await release(deps, org, res, `Send failed: ${String(e).slice(0, 120)}`);
      await save(deps, org, { ...m, status: "failed", updatedAt: iso(deps) });
      throw e instanceof ContractError ? e : new ContractError("internal", `Provider refused the send: ${String(e).slice(0, 200)}`);
    }
    return true;
  });
  void body;
  return requireMessage(deps, org, id);
}

/** Graph: (Person)-[:CONTACTED_VIA|REPLIED_TO]->(Message)-[:SENT_BY]->(Supplier). */
async function graphTouch(
  deps: Deps,
  org: Org,
  lead: Awaited<ReturnType<typeof requireLead>>,
  m: Message,
  rel: "CONTACTED_VIA" | "REPLIED_TO",
  props: Record<string, unknown>,
) {
  const msgNode = `message:${m.id}`;
  await upsertNode(deps.db, org, msgNode, "Message", `${m.channel} step ${m.step}: ${m.subject}`.slice(0, 120), {
    channel: m.channel,
    variant: m.variant,
    valueProp: m.valueProp,
  });
  await upsertEdge(deps.db, org, msgNode, "SENT_BY", supplierNode(org));
  const c = lead.contacts.find((x) => !x.isTestContact && x.kind === "person") ?? lead.contacts.find((x) => !x.isTestContact);
  if (c) await upsertEdge(deps.db, org, `person:${slug(c.email ?? c.name ?? "contact")}`, rel, msgNode, props);
}

/** Inbound reply (webhook or labeled simulation). Deduped by provider id; advances only the matching lead. */
export async function recordReply(deps: Deps, org: Org, messageId: string, reply: { from: string; text: string; providerId: string; simulated: boolean }) {
  const m = await requireMessage(deps, org, messageId);
  if (m.status !== "sent") throw new ContractError("conflict", "Only sent messages can receive replies");
  await idempotent(deps, org, `reply:${reply.providerId}`, async () => {
    const contact = { kind: "contact" as const, name: reply.from };
    await logActivity(deps, deps.db, org, {
      actor: contact,
      type: "reply_received",
      leadId: m.leadId,
      channel: m.channel,
      variant: m.variant,
      summary: `${reply.simulated ? "[Simulated] " : ""}Reply from ${reply.from}: "${reply.text.slice(0, 180)}"`,
    });
    const lead = await requireLead(deps, org, m.leadId);
    await graphTouch(deps, org, lead, m, "REPLIED_TO", { at: iso(deps), simulated: reply.simulated });
    if (lead.stage === "contacted" || lead.stage === "matched") await setStage(deps, org, m.leadId, "replied", contact, "inbound reply matched to message");
    return true;
  });
  return requireMessage(deps, org, messageId);
}

/** Find org + message for an inbound webhook addressed to reply+<messageId>@domain. */
export async function findMessageGlobally(deps: Deps, messageId: string) {
  const rows = await deps.db.query<{ org_id: string; name: string }>(
    "select d.org_id, o.name from docs d join orgs o on o.id = d.org_id where d.kind = 'message' and d.id = $1",
    [messageId],
  );
  const r = rows[0];
  return r ? { id: r.org_id, name: r.name } : null;
}
