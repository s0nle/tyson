"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentFeed, cutoffOf, ScoreBar, StatusChip } from "@/components/bits";
import { api, refreshAll } from "@/lib/api";
import { usePoll } from "@/lib/hooks";

export default function OpportunitiesPage() {
  const runs = usePoll(() => api("listRuns"), [], 1500);
  const leads = usePoll(() => api("listLeads"), [], 3000);
  const comps = usePoll(() => api("listCompetitors"), [], 10000);
  const profile = usePoll(() => api("getProfile"), [], 0);
  const [mode, setMode] = useState<"live" | "seed">("live");
  const [replay, setReplay] = useState("");
  const [feedOpen, setFeedOpen] = useState(true);
  const [filter, setFilter] = useState<"all" | "actionable" | "other">("all");
  const [err, setErr] = useState<string | null>(null);
  const run = runs.data?.runs[0];
  const running = run && (run.status === "running" || run.status === "queued");

  useEffect(() => {
    if (run?.status === "done") refreshAll();
  }, [run?.status]);

  async function start() {
    setErr(null);
    try {
      await api("startRun", { body: { mode, asOf: replay ? new Date(replay).toISOString() : undefined } });
      setFeedOpen(true);
      refreshAll();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const rows = (leads.data?.leads ?? []).filter((l) =>
    filter === "all" ? true : filter === "actionable" ? l.qualification.status === "actionable" : l.qualification.status !== "actionable",
  );
  const approved = profile.data?.profile?.status === "approved";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold condensed">Opportunities</h1>
          <p className="text-ink-2 mt-1 max-w-2xl">Contractors currently collecting supplier quotes for work you sell. Each one is judged by its own supplier cutoff, never the utility's bid date.</p>
        </div>
        <div className="panel p-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold">
            Sources
            <select className="field mt-1 !py-1.5" value={mode} onChange={(e) => setMode(e.target.value as "live" | "seed")}>
              <option value="live">Live web search + Oakland snapshots</option>
              <option value="seed">Oakland snapshots only</option>
            </select>
          </label>
          <label className="text-xs font-semibold">
            Replay clock (optional)
            <input type="datetime-local" className="field mt-1 !py-1.5" value={replay} onChange={(e) => setReplay(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" disabled={!approved || !!running} onClick={start}>
            {running ? "Discovering…" : "Run discovery"}
          </button>
        </div>
      </header>
      {!approved && (
        <p className="panel p-4 text-sm">Approve your <Link className="text-spec underline" href="/">supplier profile</Link> first. Discovery only runs against an approved profile.</p>
      )}
      {err && <p className="text-redline text-sm">{err}</p>}
      {run && <AgentFeed run={run} open={feedOpen} onToggle={() => setFeedOpen((v) => !v)} />}

      <section className="panel overflow-x-auto">
        <div className="flex items-center justify-between gap-3 p-4 flex-wrap">
          <h2 className="text-xl font-bold condensed">
            {leads.data?.leads.length ?? 0} matched contractor requests
          </h2>
          <div className="flex gap-1 text-sm" role="tablist">
            {(["all", "actionable", "other"] as const).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={`btn !py-1 ${filter === f ? "bg-spec-2 !border-spec text-spec" : ""}`} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "actionable" ? "Actionable" : "Closed / review"}
              </button>
            ))}
          </div>
        </div>
        <table className="datagrid">
          <thead>
            <tr>
              <th>Contractor</th>
              <th>Project</th>
              <th>Matched scope</th>
              <th>Status</th>
              <th>Your cutoff</th>
              <th>Fit</th>
              <th>Evidence</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/leads/${l.id}`} className="font-semibold text-spec underline-offset-2 hover:underline">{l.contractorName}</Link>
                  <div className="text-xs text-ink-3">{l.origin === "seed" ? "Curated snapshot" : "Live search"}</div>
                </td>
                <td className="max-w-[260px]">
                  <div>{l.projectNumber ? `${l.projectNumber} · ` : ""}{l.projectTitle}</div>
                  <div className="text-xs text-ink-3">{l.ownerName}</div>
                </td>
                <td className="max-w-[240px] text-ink-2">{l.scopes.join("; ")}</td>
                <td><StatusChip q={l.qualification} /></td>
                <td className={`whitespace-nowrap ${l.qualification.status === "closed_window" ? "text-redline line-through decoration-1" : ""}`}>{cutoffOf(l)}</td>
                <td><ScoreBar s={l.score} /></td>
                <td className="capitalize">{l.evidenceStrength}</td>
                <td className="capitalize">{l.stage.replace("_", " ")}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-ink-2 py-10">
                  {approved ? "No matches yet. Run discovery to search utility postings and contractor notices." : "Approve a supplier profile to start."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel p-5 space-y-3">
        <div>
          <h2 className="text-xl font-bold condensed">Competitors</h2>
          <p className="text-sm text-ink-2">Businesses offering the services you sell. Contractors are prospects; these firms compete with you for the same quote requests.</p>
        </div>
        {comps.data?.competitors.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {comps.data.competitors.map((c) => (
              <div key={c.id} className="border border-rule rounded-md p-4 space-y-1.5 text-sm">
                <div className="flex justify-between gap-2"><a className="font-semibold text-spec underline" href={c.url} target="_blank" rel="noreferrer">{c.name}</a><span className="chip tone-muted capitalize">{c.category}</span></div>
                <p>{c.positioning}</p>
                <p className="text-ink-2">Pricing: {c.pricing}</p>
                {c.differentiators.length > 0 && <p className="text-ink-2">Differentiators: {c.differentiators.join("; ")}</p>}
                <blockquote className="border-l-2 border-spec pl-2 text-ink-2">“{c.citation.excerpt.slice(0, 220)}” <a className="text-spec underline" href={c.citation.url} target="_blank" rel="noreferrer">source</a></blockquote>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-3">Run a live discovery to map competitors from public pages. Every claim cites its page.</p>
        )}
      </section>
    </div>
  );
}
