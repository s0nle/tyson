"use client";
import Link from "next/link";
import { use, useState } from "react";
import { DeadlineStamp, ScoreDetail, StatusChip } from "@/components/bits";
import { GraphPath } from "@/components/GraphPath";
import { MessageCard } from "@/components/MessageCard";
import { type Contact, ContractError, formatInZone, type LeadDetail } from "@/contract";
import { api, refreshAll } from "@/lib/api";
import { actorLabel, timeAgo } from "@/lib/format";
import { usePoll } from "@/lib/hooks";

export default function LeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = use(params);
  const { data: lead, error } = usePoll(() => api("getLead", { params: { leadId } }), [leadId], 3000);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [replay, setReplay] = useState("");

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ tone: "ok", text: ok });
      refreshAll();
    } catch (e) {
      const ce = e as ContractError;
      setMsg({ tone: "err", text: ce.code === "insufficient_credits" ? `Blocked by credit gate: ${ce.message}` : ce.message });
      refreshAll();
    }
  }

  if (error) return <p className="text-redline">{error.message}</p>;
  if (!lead) return <p className="text-ink-2">Loading lead…</p>;
  const actionable = lead.qualification.status === "actionable";

  return (
    <div className="space-y-6">
      <Link href="/opportunities" className="text-sm text-spec underline">All opportunities</Link>
      <header className="flex flex-wrap gap-6 items-start justify-between">
        <div className="space-y-2 max-w-3xl">
          <div className="flex gap-2 items-center flex-wrap">
            <StatusChip q={lead.qualification} />
            <span className="text-sm text-ink-2">Evidence {lead.evidenceStrength} · {lead.origin === "seed" ? "curated snapshot" : "live search"} · stage {lead.stage.replace("_", " ")}</span>
          </div>
          <h1 className="text-3xl font-extrabold condensed">{lead.contractorName}</h1>
          <p className="text-ink-2">
            Bidding {lead.projectNumber ? `${lead.projectNumber} · ` : ""}{lead.projectTitle} for {lead.ownerName}, {lead.project.location}
            {lead.project.estimate ? ` · project estimate ${lead.project.estimate} (your order value unknown)` : ""}
          </p>
          <p className="font-semibold">Next: {lead.nextAction}</p>
          <ul className="text-sm text-ink-2 list-disc pl-5">
            {lead.qualification.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
        <div className="flex flex-col items-end gap-3">
          <DeadlineStamp q={lead.qualification} />
          <div className="flex gap-2 items-end">
            <label className="text-xs font-semibold">Replay clock
              <input type="datetime-local" className="field !py-1 mt-1" value={replay} onChange={(e) => setReplay(e.target.value)} />
            </label>
            <button type="button" className="btn" onClick={() => act(() => api("evaluateLead", { params: { leadId }, body: { idempotencyKey: crypto.randomUUID(), asOf: replay ? new Date(replay).toISOString() : undefined } }), "Re-evaluated from the graph (1 credit)")}>
              Re-evaluate · 1 credit
            </button>
          </div>
        </div>
      </header>
      {msg && <p className={`panel p-3 text-sm ${msg.tone === "err" ? "text-redline border-[#ecc3bc]" : "text-open"}`}>{msg.text}</p>}

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <Section title="Which part of the work fits">
            <ul className="space-y-3">
              {lead.scopeMatches.map((m) => (
                <li key={m.service + m.scope} className="text-sm">
                  <div><b>{m.service}</b> matches “{m.scope}” <span className="chip tone-muted">{m.strength === "named_equipment" ? "named equipment" : "trade level"}</span></div>
                  <Cite c={m.citation} />
                </li>
              ))}
            </ul>
          </Section>

          <Section title="When and how to respond">
            <Timeline lead={lead} />
            <p className="text-sm mt-3"><b>Response route:</b> {lead.responseMethod}</p>
            {lead.requirements.length > 0 && (
              <div className="mt-3 text-sm">
                <b>Eligibility</b>
                <ul className="mt-1 space-y-1">
                  {lead.requirements.map((r) => (
                    <li key={r.text} className="flex gap-2 items-baseline">
                      <span className={`chip ${r.supplierHas === "yes" ? "tone-open" : r.supplierHas === "no" ? "tone-closed" : "tone-review"}`}>{r.supplierHas === "unknown" ? "Unknown" : r.supplierHas === "yes" ? "Held" : "Missing"}</span>
                      <span>{r.credential ?? r.text}{r.mandatory ? " (mandatory)" : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Outreach (human approval required)">
            {!actionable && <p className="text-sm text-redline mb-3">Outreach on this request is suppressed: {lead.qualification.label}. The account stays in the graph for future projects.</p>}
            <div className="flex gap-2 flex-wrap mb-4">
              <button type="button" className="btn btn-primary" disabled={!actionable} onClick={() => act(() => api("draftMessage", { params: { leadId }, body: { channel: "email", variant: "A" } }), "Builder drafted variant A")}>Draft email · variant A</button>
              <button type="button" className="btn" disabled={!actionable} onClick={() => act(() => api("draftMessage", { params: { leadId }, body: { channel: "email", variant: "B" } }), "Builder drafted variant B")}>Draft variant B</button>
              <button type="button" className="btn" disabled={!actionable} onClick={() => act(() => api("draftMessage", { params: { leadId }, body: { channel: "linkedin", variant: "A" } }), "Builder drafted a LinkedIn note")}>Draft LinkedIn note</button>
            </div>
            <div className="space-y-4">
              {lead.messages.map((m) => <MessageCard key={m.id} m={m} act={act} />)}
              {lead.messages.length === 0 && <p className="text-sm text-ink-3">No drafts yet. Drafts are free; sending costs 1 credit after you approve.</p>}
            </div>
            <div className="flex gap-2 flex-wrap mt-4 text-sm items-center">
              <span className="text-ink-2">Milestones:</span>
              {(["quote_requested", "drawings_received", "quote_submitted"] as const).map((k) => {
                const done = lead.milestones.some((m) => m.key === k);
                return (
                  <button key={k} type="button" className={`btn !py-1 ${done ? "tone-open" : ""}`} disabled={done} onClick={() => act(() => api("moveLead", { params: { leadId }, body: { milestone: k } }))}>
                    {k.replace(/_/g, " ")}{done ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Fit score">
            <ScoreDetail s={lead.score} />
            <p className="text-xs text-ink-3 mt-2">Evidence strength ({lead.evidenceStrength}) is scored separately. A perfect fit can still have a closed window.</p>
          </Section>

          <Section title="Who is asking">
            <div className="space-y-3">
              {lead.contacts.map((c) => (
                <ContactRow key={c.id} c={c} disabled={!actionable} onVerify={() => act(() => api("verifyContact", { params: { leadId, contactId: c.id }, body: { idempotencyKey: crypto.randomUUID() } }))} />
              ))}
            </div>
          </Section>

          <Section title="Graph path">
            <GraphPath g={lead.graphPath} />
          </Section>

          <Section title={`Credits spent on this lead: ${lead.billing.spent}`}>
            <ul className="text-sm space-y-1">
              {lead.billing.entries.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>{e.operation.replace(/_/g, " ")} <span className="text-ink-3">· {e.note}</span></span>
                  <span className={e.credits < 0 ? "font-semibold" : "text-ink-3"}>{e.credits}</span>
                </li>
              ))}
              {lead.billing.entries.length === 0 && <li className="text-ink-3">Nothing billed yet. Cached evidence is free.</li>}
            </ul>
          </Section>

          <Section title="Activity">
            <ul className="text-sm space-y-2 max-h-80 overflow-auto">
              {lead.activity.map((a) => (
                <li key={a.id} className="grid grid-cols-[92px_1fr] gap-2">
                  <span className={`chip h-fit justify-center ${a.actor.kind === "agent" ? "bg-agent-2 text-agent" : a.actor.kind === "rep" ? "bg-spec-2 text-spec" : a.actor.kind === "contact" ? "tone-open" : "tone-muted"}`}>{a.actor.kind === "rep" ? "Rep" : actorLabel(a.actor)}</span>
                  <span>{a.summary} <span className="text-ink-3 text-xs">{timeAgo(a.at)}</span></span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="text-lg font-bold condensed mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Cite({ c }: { c: { url: string; excerpt: string; retrievedAt: string; version: number } }) {
  return (
    <blockquote className="mt-1 border-l-2 border-spec pl-2 text-ink-2 text-sm">
      “{c.excerpt}”
      <span className="block text-xs">
        <a className="text-spec underline" href={c.url} target="_blank" rel="noreferrer">Source</a> · retrieved {formatInZone(c.retrievedAt)} · v{c.version}
      </span>
    </blockquote>
  );
}

function Timeline({ lead }: { lead: LeadDetail }) {
  const items = [
    ...lead.deadlines.map((d) => ({ at: d.at, label: d.kind === "owner_bid_opening" ? "Utility bid opening (prime bidders)" : d.kind === "supplier_form" ? "Supplier form due (applies to you)" : "Supplier quotes due (applies to you)", d })),
  ].sort((a, b) => (a.at ? new Date(a.at).getTime() : Infinity) - (b.at ? new Date(b.at).getTime() : Infinity));
  const asOf = new Date(lead.qualification.asOf).getTime();
  return (
    <ol className="relative border-l-2 border-rule ml-2 space-y-4">
      {items.map(({ at, label, d }) => {
        const past = at ? new Date(at).getTime() <= asOf : false;
        const deciding = lead.qualification.decidingDeadline?.rawText === d.rawText;
        return (
          <li key={label + d.rawText} className="pl-4 relative">
            <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ${past ? "bg-redline" : d.kind === "owner_bid_opening" ? "bg-ink-3" : "bg-open"}`} />
            <div className="text-sm">
              <b className={past ? "text-redline" : ""}>{at ? formatInZone(at) : "Date unknown"}</b> — {label}
              {deciding && <span className="chip tone-review ml-2">Drives the decision</span>}
            </div>
            <div className="text-xs text-ink-2">{d.derivation}</div>
            <Cite c={d.citation} />
          </li>
        );
      })}
      <li className="pl-4 relative">
        <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-spec bg-sheet" />
        <div className="text-sm text-spec font-semibold">As of {formatInZone(lead.qualification.asOf)}</div>
      </li>
    </ol>
  );
}

function ContactRow({ c, onVerify, disabled }: { c: Contact; onVerify: () => void; disabled: boolean }) {
  const v = c.verification;
  const tone = v.status === "valid" ? "tone-open" : v.status === "invalid" || v.status === "blocked" ? "tone-closed" : v.status === "unchecked" ? "tone-muted" : "tone-review";
  return (
    <div className={`border rounded-md p-3 text-sm ${c.isTestContact ? "border-dashed border-ink-3 bg-paper" : "border-rule"}`}>
      <div className="flex justify-between gap-2 items-start">
        <div>
          <div className="font-semibold">{c.name ?? c.email}</div>
          <div className="text-ink-2">{c.kind === "shared_mailbox" ? "Shared mailbox" : (c.title ?? "Named contact")}</div>
          <div className="text-ink-2">{[c.email, c.phone].filter(Boolean).join(" · ") || "No email published"}</div>
        </div>
        <span className={`chip ${tone}`}>{v.status === "unchecked" ? "Published, unverified" : v.status.replace("_", " ")}</span>
      </div>
      <div className="text-xs text-ink-3 mt-1">{v.note}{v.provider ? ` · ${v.provider}` : ""}</div>
      {!c.isTestContact && <div className="text-xs mt-1"><a className="text-spec underline" href={c.published.url} target="_blank" rel="noreferrer">Published in source</a></div>}
      {c.email && v.status !== "valid" && (
        <button type="button" className="btn !py-1 mt-2" disabled={disabled} onClick={onVerify}>Verify email · 3 credits if verified</button>
      )}
    </div>
  );
}
