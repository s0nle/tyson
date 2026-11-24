"use client";
import {
  formatInZone,
  type LeadSummary,
  type Qualification,
  type ScoreBreakdown,
} from "@/contract";
import { statusTone, timeAgo } from "@/lib/format";

export function StatusChip({ q }: { q: Qualification }) {
  return <span className={`chip ${statusTone[q.status]}`}>{q.label}</span>;
}

export function DeadlineStamp({ q }: { q: Qualification }) {
  const cls =
    q.status === "actionable"
      ? "open"
      : q.status === "closed_window"
        ? "closed"
        : "review";
  const d = q.decidingDeadline;
  const head =
    q.status === "actionable"
      ? "Pursue"
      : q.status === "closed_window"
        ? "Window closed"
        : q.label;
  const who = d
    ? d.kind === "supplier_form"
      ? "Supplier form due"
      : d.kind === "contractor_quote"
        ? "Supplier quotes due"
        : "Owner bid"
    : "No supplier cutoff found";
  return (
    <div
      className={`stamp ${cls}`}
      role="img"
      aria-label={`${head}. ${who} ${d?.at ? formatInZone(d.at) : ""}`}
    >
      <span>{head}</span>
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
    <div
      className="min-w-[85px]"
      title={parts.map(([l, v, m]) => `${l} ${v}/${m}`).join(" · ")}
    >
      <div className="score-total">
        {s.total}
        <small> / 100</small>
      </div>
      <div className="score-track">
        <span style={{ width: `${s.total}%` }} />
      </div>
      {s.tier && (
        <span className="text-xs text-open inline-block mt-2">
          Tier {s.tier}
        </span>
      )}
    </div>
  );
}

export function ScoreDetail({ s }: { s: ScoreBreakdown }) {
  const rows: [string, number, number][] = [
    ["Technical scope", s.scope, 40],
    ["Explicit buyer intent", s.intent, 25],
    ["Time vs. quote prep", s.time, 20],
    ["Contact evidence", s.contact, 15],
  ];
  return (
    <div className="space-y-1.5">
      {rows.map(([l, v, m]) => (
        <div
          key={l}
          className="grid grid-cols-[1fr_90px_44px] items-center gap-2 text-sm"
        >
          <span>{l}</span>
          <span className="h-1.5 bg-rule-2 rounded">
            <span
              className="block h-1.5 bg-spec rounded"
              style={{ width: `${(v / m) * 100}%` }}
            />
          </span>
          <span className="text-right text-ink-2">
            {v}/{m}
          </span>
        </div>
      ))}
    </div>
  );
}

export function cutoffOf(l: LeadSummary) {
  const d = l.qualification.decidingDeadline;
  return d?.at ? formatInZone(d.at) : "Deadline unknown";
}

export { timeAgo };
