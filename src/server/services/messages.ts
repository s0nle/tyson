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
import { requireLead, setStage } from "./leads";
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

export async function draftMessage(deps: Deps, org: Org, leadId: string, req: DraftRequest) {
  const lead = await requireLead(deps, org, leadId);
  if (lead.qualification.status !== "actionable") {
    throw new ContractError("conflict", `Outreach suppressed: ${lead.qualification.label}. ${lead.qualification.reasons[0] ?? ""}`);
  }
  const profile = await getProfile(deps, org);
  if (!profile) throw new ContractError("conflict", "No supplier profile");
  const existing = (await listDocs(deps.db, org.id, "message", Message)).filter((m) => m.leadId === leadId);
  const person = lead.contacts.find((c) => !c.isTestContact && c.kind === "person");
  const mailbox = lead.contacts.find((c) => !c.isTestContact && c.email);
  const channel = req.channel ?? "email";
  const variant = req.variant ?? "A";
  const draft = await deps.ai.draft({
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
    step: existing.length + 1,
  });
  const recipient = deps.config.demoInbox;
  const groundedOn = [lead.notice.sourceUrl, ...lead.scopeMatches.map((s) => s.citation.url)].filter((v, i, a) => a.indexOf(v) === i);
  const route = [mailbox?.email, person ? `Attn: ${person.name}${person.title ? ` (${person.title})` : ""}` : null].filter(Boolean).join(" · ");
  const m: Message = {
    id: crypto.randomUUID(),
    leadId,
    step: existing.length + 1,
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
    createdBy: AGENTS.builder,
    updatedAt: iso(deps),
  };
  await save(deps, org, m);
  await logActivity(deps, deps.db, org, { actor: AGENTS.builder, type: "draft_created", leadId, channel, variant, summary: `Drafted ${channel} step ${m.step} (variant ${variant}): "${m.subject}"` });
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
