"use client";
import { formatInZone, type LeadSummary, type Qualification, type Run, type ScoreBreakdown } from "@/contract";
import { actorLabel, statusTone, timeAgo } from "@/lib/format";

export function StatusChip({ q }: { q: Qualification }) {
  return <span className={`chip ${statusTone[q.status]}`}>{q.label}</span>;
}

export function DeadlineStamp({ q }: { q: Qualification }) {
  const cls = q.status === "actionable" ? "open" : q.status === "closed_window" ? "closed" : "review";
  const d = q.decidingDeadline;
  const head = q.status === "actionable" ? "Pursue" : q.status === "closed_window" ? "Window closed" : q.label;
  const who = d ? (d.kind === "supplier_form" ? "Supplier form due" : d.kind === "contractor_quote" ? "Supplier quotes due" : "Owner bid") : "No supplier cutoff found";
  return (
    <div className={`stamp ${cls}`} role="img" aria-label={`${head}. ${who} ${d?.at ? formatInZone(d.at) : ""}`}>
      <span className="text-xl uppercase">{head}</span>
      <small>{who}</small>
      {d?.at && <small>{formatInZone(d.at)}</small>}
    </div>
  );
}

export function ScoreBar({ s }: { s: ScoreBreakdown }) {
  const parts: [string, number, number, string][] = [
    ["Scope", s.scope, 40, "#1f4e8c"],
    ["Intent", s.intent, 25, "#4f7cc0"],
    ["Time", s.time, 20, "#23704a"],
    ["Contact", s.contact, 15, "#9a6a00"],
  ];
  return (
    <div className="min-w-[120px]" title={parts.map(([l, v, m]) => `${l} ${v}/${m}`).join(" · ")}>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-extrabold condensed">{s.total}</span>
        {s.tier && <span className="chip tone-open">Tier {s.tier}</span>}
      </div>
      <div className="flex h-1.5 w-full rounded overflow-hidden bg-rule-2 mt-1">
        {parts.map(([l, v, , c]) => (
          <span key={l} style={{ width: `${v}%`, background: c }} />
        ))}
      </div>
    </div>
  );
}

export function ScoreDetail({ s }: { s: ScoreBreakdown }) {
  const rows: [string, number, number][] = [["Technical scope", s.scope, 40], ["Explicit buyer intent", s.intent, 25], ["Time vs. quote prep", s.time, 20], ["Contact evidence", s.contact, 15]];
  return (
    <div className="space-y-1.5">
      {rows.map(([l, v, m]) => (
        <div key={l} className="grid grid-cols-[1fr_90px_44px] items-center gap-2 text-sm">
          <span>{l}</span>
          <span className="h-1.5 bg-rule-2 rounded"><span className="block h-1.5 bg-spec rounded" style={{ width: `${(v / m) * 100}%` }} /></span>
          <span className="text-right text-ink-2">{v}/{m}</span>
        </div>
      ))}
    </div>
  );
}

export function AgentFeed({ run, open, onToggle }: { run: Run; open: boolean; onToggle: () => void }) {
  const roleTone: Record<string, string> = { planner: "bg-agent-2 text-agent", builder: "bg-spec-2 text-spec", reviewer: "tone-review", security: "tone-closed" };
  return (
    <section className="panel">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left" aria-expanded={open}>
        <span>
          <span className="font-bold condensed text-lg">Agent thinking</span>
          <span className="text-sm text-ink-2 ml-3">
            Run {run.id.slice(0, 8)} · {run.status === "running" || run.status === "queued" ? "working…" : run.status} · as of {formatInZone(run.asOf)}
          </span>
        </span>
        <span className="text-sm text-spec">{open ? "Hide" : "Show"} {run.steps.length} steps</span>
      </button>
      {open && (
        <ol className="border-t border-rule max-h-[420px] overflow-auto divide-y divide-rule-2">
          {run.steps.map((s, i) => (
            <li key={`${s.at}-${i}`} className="px-4 py-2.5 grid grid-cols-[86px_1fr] gap-3 text-sm">
              <span className={`chip justify-center h-fit ${roleTone[s.actor.role ?? ""] ?? "tone-muted"}`}>{actorLabel(s.actor)}</span>
              <span>
                <span className={s.kind === "error" ? "text-redline" : ""}>{s.message}</span>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer" className="block text-xs text-spec underline truncate">{s.url}</a>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function cutoffOf(l: LeadSummary) {
  const d = l.qualification.decidingDeadline;
  return d?.at ? formatInZone(d.at) : "Deadline unknown";
}

export { timeAgo };
