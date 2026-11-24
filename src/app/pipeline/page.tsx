"use client";
import Link from "next/link";
import { useState } from "react";
import { cutoffOf, StatusChip } from "@/components/bits";
import { STAGE_LABEL, STAGE_ORDER, type Stage } from "@/contract";
import { api, refreshAll } from "@/lib/api";
import { actorLabel, pct, timeAgo } from "@/lib/format";
import { usePoll } from "@/lib/hooks";

export default function PipelinePage() {
  const pipe = usePoll(() => api("getPipeline"), [], 2500);
  const [segment, setSegment] = useState("");
  const [tier, setTier] = useState<"" | "A" | "B" | "C">("");
  const stats = usePoll(() => api("getAnalytics", { query: { segment: segment || undefined, tier: tier || undefined } }), [segment, tier], 4000);
  const ledger = usePoll(() => api("getLedger"), [], 3000);
  const [err, setErr] = useState<string | null>(null);

  const move = async (leadId: string, stage: Stage) => {
    setErr(null);
    try {
      await api("moveLead", { params: { leadId }, body: { stage } });
      refreshAll();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const a = stats.data;
  const segments = [...new Set((a?.bySegment ?? []).map((s) => s.key))];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold condensed">Pipeline</h1>
        <p className="text-ink-2 mt-1">Every stage change records who moved it: an agent, a rep, or the contractor's reply.</p>
      </header>
      {err && <p className="text-redline text-sm">{err}</p>}

      <section className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {STAGE_ORDER.map((stage) => {
          const col = pipe.data?.columns.find((c) => c.stage === stage);
          return (
            <div key={stage} className="panel p-3 min-h-40">
              <div className="flex justify-between items-baseline mb-2">
                <h2 className="font-bold condensed">{STAGE_LABEL[stage]}</h2>
                <span className="text-ink-3 text-sm">{col?.leads.length ?? 0}</span>
              </div>
              <div className="space-y-2">
                {col?.leads.map((l) => (
                  <div key={l.id} className="border border-rule rounded-md p-2 text-sm bg-paper">
                    <Link href={`/leads/${l.id}`} className="font-semibold text-spec hover:underline">{l.contractorName}</Link>
                    <div className="text-xs text-ink-2 truncate">{l.projectNumber ?? l.projectTitle}</div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <StatusChip q={l.qualification} />
                      {l.score.tier && <span className="chip tone-open">Tier {l.score.tier}</span>}
                    </div>
                    <div className="text-xs text-ink-3 mt-1">Cutoff {cutoffOf(l)}</div>
                    {l.milestones.length > 0 && <div className="text-xs text-open">{l.milestones.map((m) => m.key.replace(/_/g, " ")).join(", ")}</div>}
                    <select
                      aria-label="Move to stage"
                      className="field !py-0.5 !text-xs mt-1"
                      value={l.stage}
                      onChange={(e) => move(l.id, e.target.value as Stage)}
                    >
                      {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="panel p-5 space-y-4">
          <div className="flex justify-between items-end gap-3 flex-wrap">
            <h2 className="text-xl font-bold condensed">Conversion</h2>
            <div className="flex gap-2 text-sm">
              <select className="field !py-1" value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Segment">
                <option value="">All segments</option>
                {segments.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select className="field !py-1" value={tier} onChange={(e) => setTier(e.target.value as "" | "A" | "B" | "C")} aria-label="Tier">
                <option value="">All tiers</option>
                <option value="A">Tier A</option>
                <option value="B">Tier B</option>
                <option value="C">Tier C</option>
              </select>
            </div>
          </div>
          <table className="datagrid">
            <thead><tr><th>Step</th><th>Converted</th><th>Rate</th></tr></thead>
            <tbody>
              {a?.conversions.map((c) => (
                <tr key={c.from}>
                  <td>{STAGE_LABEL[c.from]} → {STAGE_LABEL[c.to]}</td>
                  <td>{c.numerator} of {c.denominator}</td>
                  <td className="font-semibold">{pct(c.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <h3 className="font-semibold mb-1">Qualification</h3>
              {a?.qualification.map((q) => <div key={q.status} className="flex justify-between"><span className="capitalize">{q.status.replace("_", " ")}</span><b>{q.count}</b></div>)}
            </div>
            <div>
              <h3 className="font-semibold mb-1">Who acted</h3>
              {a?.actorSplit.map((x) => <div key={x.kind} className="flex justify-between"><span>{x.kind === "agent" ? "AI agents" : x.kind === "rep" ? "Sales rep" : x.kind === "contact" ? "Contractor" : "System"}</span><b>{x.count}</b></div>)}
            </div>
            <div>
              <h3 className="font-semibold mb-1">By segment</h3>
              {a?.bySegment.map((s) => <div key={s.key} className="flex justify-between gap-2"><span className="truncate">{s.key}</span><span>{s.contacted}/{s.leads} contacted · {s.replied} replied</span></div>)}
            </div>
            <div>
              <h3 className="font-semibold mb-1">By tier</h3>
              {a?.byTier.map((s) => <div key={s.key} className="flex justify-between gap-2"><span>{s.key}</span><span>{s.contacted}/{s.leads} contacted · {s.replied} replied</span></div>)}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-1">Message variants</h3>
            <table className="datagrid">
              <thead><tr><th>Variant</th><th>Channel</th><th>Sent</th><th>Replied</th><th>Reply rate</th></tr></thead>
              <tbody>
                {a?.variants.map((v) => (
                  <tr key={v.variant + v.channel}><td>{v.variant}</td><td className="capitalize">{v.channel}</td><td>{v.sent}</td><td>{v.replied}</td><td>{pct(v.rate)}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-ink-3 mt-1">Rates appear as sends accumulate; a handful of sends is not a significant test.</p>
          </div>
        </section>

        <div className="space-y-6">
          <section className="panel p-5">
            <div className="flex justify-between items-baseline">
              <h2 className="text-xl font-bold condensed">Credits ledger</h2>
              <span className="text-sm">
                <b className="text-2xl condensed">{ledger.data?.available ?? "–"}</b> available · {ledger.data?.spent ?? 0} spent
              </span>
            </div>
            <p className="text-xs text-ink-2 mt-1">
              Flexprice {ledger.data?.flexprice.mode === "live" ? "live" : "not configured (local ledger only)"} · customer {ledger.data?.flexprice.customerExternalId}
              {ledger.data?.flexprice.walletBalance !== null && ledger.data?.flexprice.walletBalance !== undefined ? ` · wallet ${ledger.data.flexprice.walletBalance}` : ""}
            </p>
            <table className="datagrid mt-3">
              <thead><tr><th>Event</th><th>Lead</th><th>Status</th><th className="text-right">Credits</th></tr></thead>
              <tbody>
                {ledger.data?.entries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.operation.replace(/_/g, " ")}
                      <div className="text-xs text-ink-3 break-all">{e.id}</div>
                    </td>
                    <td>{e.leadId ? <Link className="text-spec underline" href={`/leads/${e.leadId}`}>open</Link> : "—"}</td>
                    <td className="text-xs">{e.status}{e.flexprice !== "disabled" ? ` · Flexprice ${e.flexprice}` : ""}<div className="text-ink-3">{e.note}</div></td>
                    <td className={`text-right font-semibold ${e.credits < 0 ? "" : "text-open"}`}>{e.credits > 0 ? `+${e.credits}` : e.credits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel p-5">
            <h2 className="text-xl font-bold condensed mb-3">Activity</h2>
            <ul className="text-sm space-y-2 max-h-[480px] overflow-auto">
              {pipe.data?.activity.map((x) => (
                <li key={x.id} className="grid grid-cols-[96px_1fr] gap-2">
                  <span className={`chip h-fit justify-center ${x.actor.kind === "agent" ? "bg-agent-2 text-agent" : x.actor.kind === "rep" ? "bg-spec-2 text-spec" : x.actor.kind === "contact" ? "tone-open" : "tone-muted"}`}>{x.actor.kind === "rep" ? "Rep" : actorLabel(x.actor)}</span>
                  <span>{x.summary} <span className="text-xs text-ink-3">{timeAgo(x.at)}</span></span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
