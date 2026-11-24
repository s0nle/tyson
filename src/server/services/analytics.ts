import { type Analytics, Message, STAGE_ORDER, type Stage } from "@/contract";
import { listDocs } from "../db";
import type { Deps } from "../deps";
import { iso, listActivity, type Org } from "./base";
import { allLeads } from "./leads";

const reached = (stage: Stage, target: Stage) => {
  if (target === "closed_won" || target === "closed_lost") return stage === target;
  const order = ["matched", "contacted", "replied", "meeting_booked", "closed_won"] as const;
  const s = stage === "closed_lost" ? 1 : order.indexOf(stage as (typeof order)[number]);
  return s >= order.indexOf(target as (typeof order)[number]);
};

export async function analytics(deps: Deps, org: Org, q: { segment?: string; tier?: string }): Promise<Analytics> {
  let leads = await allLeads(deps, org);
  if (q.segment) leads = leads.filter((l) => l.segment === q.segment);
  if (q.tier) leads = leads.filter((l) => l.score.tier === q.tier);
  const ids = new Set(leads.map((l) => l.id));
  const engaged = leads.filter((l) => l.qualification.status === "actionable" || l.stage !== "matched");
  const messages = (await listDocs(deps.db, org.id, "message", Message)).filter((m) => ids.has(m.leadId));
  const activity = (await listActivity(deps.db, org, undefined, 1000)).filter((a) => !a.leadId || ids.has(a.leadId));
  const repliedLeads = new Set(activity.filter((a) => a.type === "reply_received").map((a) => a.leadId));

  const funnel: [Stage, Stage][] = [
    ["matched", "contacted"],
    ["contacted", "replied"],
    ["replied", "meeting_booked"],
    ["meeting_booked", "closed_won"],
  ];
  const group = (key: (l: (typeof leads)[number]) => string) => {
    const m = new Map<string, { leads: number; contacted: number; replied: number }>();
    for (const l of leads) {
      const k = key(l);
      const g = m.get(k) ?? { leads: 0, contacted: 0, replied: 0 };
      g.leads++;
      if (reached(l.stage, "contacted")) g.contacted++;
      if (reached(l.stage, "replied")) g.replied++;
      m.set(k, g);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v }));
  };
  const variants = (["A", "B"] as const).flatMap((variant) =>
    (["email", "linkedin"] as const).map((channel) => {
      const sent = messages.filter((m) => m.variant === variant && m.channel === channel && m.status === "sent");
      const replied = sent.filter((m) => repliedLeads.has(m.leadId)).length;
      const valueProp = (sent[0] ?? messages.find((m) => m.variant === variant))?.valueProp.split(":")[0] ?? (variant === "A" ? "Scope match" : "Local track record");
      return { variant, valueProp, channel, sent: sent.length, replied, rate: sent.length ? replied / sent.length : null };
    }),
  );
  return {
    asOf: iso(deps),
    stageCounts: STAGE_ORDER.map((stage) => ({ stage, count: engaged.filter((l) => l.stage === stage).length })),
    conversions: funnel.map(([from, to]) => {
      const denominator = engaged.filter((l) => reached(l.stage, from)).length;
      const numerator = engaged.filter((l) => reached(l.stage, to)).length;
      return { from, to, numerator, denominator, rate: denominator ? numerator / denominator : null };
    }),
    qualification: (["actionable", "closed_window", "needs_review", "disqualified"] as const).map((status) => ({
      status,
      count: leads.filter((l) => l.qualification.status === status).length,
    })),
    actorSplit: (["agent", "rep", "system", "contact"] as const).map((kind) => ({ kind, count: activity.filter((a) => a.actor.kind === kind).length })),
    bySegment: group((l) => l.segment),
    byTier: group((l) => (l.score.tier ? `Tier ${l.score.tier}` : l.qualification.label)),
    variants: variants.filter((v) => v.sent > 0 || v.channel === "email"),
  };
}
