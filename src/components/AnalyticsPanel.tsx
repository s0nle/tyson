"use client";
import { useState } from "react";
import { STAGE_LABEL, STAGE_ORDER } from "@/contract";
import { api } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { actorLabel, pct, timeAgo } from "@/lib/format";

const ACTOR_LABEL = { agent: "AI agents", rep: "Sales rep", contact: "Contractor", system: "System" } as const;

/** Funnel, segment/tier splits, AI-vs-rep attribution, variant tests and the audit trail. */
export function AnalyticsPanel() {
  const [segment, setSegment] = useState("");
  const [tier, setTier] = useState<"" | "A" | "B" | "C">("");
  const stats = usePoll(
    () => api("getAnalytics", { query: { segment: segment || undefined, tier: tier || undefined } }),
    [segment, tier],
    4000,
  );
  const pipe = usePoll(() => api("getPipeline"), [], 4000);
  const a = stats.data;
  const segments = [...new Set((a?.bySegment ?? []).map((s) => s.key))];
  const maxStage = Math.max(1, ...(a?.stageCounts ?? []).map((s) => s.count));
  const actorTotal = (a?.actorSplit ?? []).reduce((n, x) => n + x.count, 0) || 1;

  return (
    <div className="analytics">
      <header className="dashboard-heading">
        <div>
          <h1>Analytics</h1>
          <p>How opportunities move through your pipeline, and who moved them.</p>
        </div>
        <div className="analytics-filters">
          <label>
            <span className="form-label">Industry segment</span>
            <select className="field" value={segment} onChange={(e) => setSegment(e.target.value)}>
              <option value="">All segments</option>
              {segments.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">Company tier</span>
            <select className="field" value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}>
              <option value="">All tiers</option>
              <option value="A">Tier A</option>
              <option value="B">Tier B</option>
              <option value="C">Tier C</option>
            </select>
          </label>
        </div>
      </header>
      {stats.error && (
        <p className="notice notice-error" role="alert">
          {stats.error.message}
        </p>
      )}

      <section className="panel analytics-card">
        <h2>Pipeline by stage</h2>
        <div className="funnel">
          {STAGE_ORDER.map((s) => {
            const n = a?.stageCounts.find((x) => x.stage === s)?.count ?? 0;
            return (
              <div key={s} className="funnel-row">
                <span>{STAGE_LABEL[s]}</span>
                <span className="funnel-track">
                  <span className="funnel-fill" style={{ width: `${(n / maxStage) * 100}%` }} />
                </span>
                <strong>{n}</strong>
              </div>
            );
          })}
        </div>
        <table className="datagrid mt-5">
          <thead>
            <tr>
              <th>Conversion</th>
              <th>Converted</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {a?.conversions.map((c) => (
              <tr key={c.from}>
                <td>
                  {STAGE_LABEL[c.from]} → {STAGE_LABEL[c.to]}
                </td>
                <td>
                  {c.numerator} of {c.denominator}
                </td>
                <td>
                  <strong>{pct(c.rate)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="analytics-grid">
        <section className="panel analytics-card">
          <h2>Who moved the work</h2>
          <p className="section-description">Autonomous agent actions vs. direct rep actions, from the audit log.</p>
          <div className="actor-bar" aria-hidden="true">
            {(a?.actorSplit ?? []).map((x) => (
              <span key={x.kind} className={`actor-${x.kind}`} style={{ flex: x.count }} />
            ))}
          </div>
          <ul className="stat-list">
            {(a?.actorSplit ?? []).map((x) => (
              <li key={x.kind}>
                <span>
                  <i className={`dot actor-${x.kind}`} />
                  {ACTOR_LABEL[x.kind]}
                </span>
                <strong>
                  {x.count} <small>{Math.round((x.count / actorTotal) * 100)}%</small>
                </strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel analytics-card">
          <h2>Qualification</h2>
          <p className="section-description">Hard constraints applied before any outreach.</p>
          <ul className="stat-list">
            {(a?.qualification ?? []).map((q) => (
              <li key={q.status}>
                <span>
                  {{ actionable: "Ready to pursue", closed_window: "Window closed", needs_review: "Needs review", disqualified: "Not eligible" }[q.status]}
                </span>
                <strong>{q.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="analytics-grid">
        <section className="panel analytics-card">
          <h2>By industry segment</h2>
          <table className="datagrid">
            <thead>
              <tr>
                <th>Segment</th>
                <th>Leads</th>
                <th>Contacted</th>
                <th>Replied</th>
              </tr>
            </thead>
            <tbody>
              {a?.bySegment.map((s) => (
                <tr key={s.key}>
                  <td>{s.key}</td>
                  <td>{s.leads}</td>
                  <td>{s.contacted}</td>
                  <td>{s.replied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel analytics-card">
          <h2>By company tier</h2>
          <table className="datagrid">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Leads</th>
                <th>Contacted</th>
                <th>Replied</th>
              </tr>
            </thead>
            <tbody>
              {a?.byTier.map((s) => (
                <tr key={s.key}>
                  <td>{s.key}</td>
                  <td>{s.leads}</td>
                  <td>{s.contacted}</td>
                  <td>{s.replied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel analytics-card">
        <h2>Message tests</h2>
        <p className="section-description">Reply rate by value proposition and channel. Small samples are directional, not significant.</p>
        <table className="datagrid">
          <thead>
            <tr>
              <th>Variant</th>
              <th>Value proposition</th>
              <th>Channel</th>
              <th>Sent</th>
              <th>Replied</th>
              <th>Reply rate</th>
            </tr>
          </thead>
          <tbody>
            {a?.variants.map((v) => (
              <tr key={v.variant + v.channel}>
                <td>{v.variant}</td>
                <td>{v.valueProp}</td>
                <td className="capitalize">{v.channel}</td>
                <td>{v.sent}</td>
                <td>{v.replied}</td>
                <td>{pct(v.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel analytics-card">
        <h2>Audit trail</h2>
        <p className="section-description">Every consequential action, with who did it and when.</p>
        <ul className="audit-list">
          {pipe.data?.activity.map((x) => (
            <li key={x.id}>
              <span className={`chip actor-chip actor-${x.actor.kind}`}>{x.actor.kind === "rep" ? "Rep" : actorLabel(x.actor)}</span>
              <span>{x.summary}</span>
              <time dateTime={x.at}>{timeAgo(x.at)}</time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
