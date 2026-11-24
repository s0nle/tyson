"use client";
import { useEffect, useRef, useState } from "react";
import { STAGE_LABEL, STAGE_ORDER, type Stage } from "@/contract";
import { api, refreshAll, setUser } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { Brand, EmptyState, Icon } from "./ui";
import { BusinessDrawer, HoverAccordion } from "./HoverPanels";
import { BusinessProfile } from "./BusinessProfile";
import { DiscoveryProgress } from "./Progress";
import { OpportunityCard } from "./OpportunityCard";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { QueuePanel } from "./QueuePanel";
import dynamic from "next/dynamic";

const ServiceAreaMap = dynamic(() => import("./ServiceAreaMap").then((m) => m.ServiceAreaMap), {
  ssr: false,
  loading: () => <p className="field-help">Loading map…</p>,
});

export function Workspace() {
  const profile = usePoll(() => api("getProfile"), [], 0);
  const me = usePoll(() => api("getMe"), [], 4000);
  const leads = usePoll(() => api("listLeads"), [], 3000);
  const runs = usePoll(() => api("listRuns"), [], 1500);
  const competitors = usePoll(() => api("listCompetitors"), [], 10000);
  const pipeline = usePoll(() => api("getPipeline"), [], 3000);
  const ledger = usePoll(() => api("getLedger"), [], 5000);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "ready" | "other">("all");
  const [stage, setStage] = useState<Stage | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"live" | "seed">("live");
  const [replay, setReplay] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [initialLead, setInitialLead] = useState("");
  const [competitionVisible, setCompetitionVisible] = useState(true);
  const [view, setView] = useState<"opportunities" | "queue" | "analytics">("opportunities");
  const queue = usePoll(() => api("getQueue"), [], 4000);
  const queueCount = queue.data?.items.filter((i) => i.message.status === "draft").length ?? 0;
  const [approving, setApproving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  async function approveFromBanner() {
    setApproving(true);
    setError("");
    try {
      await api("approveProfile");
      await profile.reload();
      refreshAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApproving(false);
    }
  }
  function openLead(id: string) {
    setInitialLead(id);
    setView("opportunities");
    setFilter("all");
    setStage(null);
    setSearch("");
  }
  const startGuard = useRef(false);
  const resultsRef = useRef<HTMLElement>(null);
  const run = runs.data?.runs[0];
  const running = run?.status === "running" || run?.status === "queued";
  const previousRun = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    const p = previousRun.current;
    if (
      run?.status === "done" &&
      (p?.status === "running" || p?.status === "queued" || starting)
    ) {
      refreshAll();
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    previousRun.current = run ? { id: run.id, status: run.status } : null;
  }, [run?.id, run?.status]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitialLead(params.get("lead") || "");
    if (params.get("panel") === "business") setBusinessOpen(true);
    const v = params.get("view");
    if (v === "analytics" || v === "queue") setView(v);
    if (params.get("settings") === "open") setSettingsOpen(true);
  }, []);
  async function discover() {
    if (startGuard.current) return;
    startGuard.current = true;
    setStarting(true);
    setError("");
    try {
      await api("startRun", {
        body: {
          mode,
          asOf: replay ? new Date(replay).toISOString() : undefined,
        },
      });
      setFilter("all");
      setStage(null);
      setSearch("");
      await runs.reload();
      refreshAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
      startGuard.current = false;
    }
  }
  const p = profile.data?.profile ?? null;
  const all = leads.data?.leads ?? [];
  const approved = p?.status === "approved";
  const columns = pipeline.data?.columns ?? [];
  const stageIds = stage
    ? new Set(
        columns.find((c) => c.stage === stage)?.leads.map((l) => l.id) ?? [],
      )
    : null;
  const rows = all
    .filter(
      (l) =>
        (filter === "all" ||
          (filter === "ready"
            ? l.qualification.status === "actionable"
            : l.qualification.status !== "actionable")) &&
        (!stageIds || stageIds.has(l.id)) &&
        `${l.contractorName} ${l.projectTitle} ${l.scopes.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.qualification.status === "actionable") -
          Number(a.qualification.status === "actionable") ||
        b.score.total - a.score.total,
    );
  const ready = all.filter(
    (l) => l.qualification.status === "actionable",
  ).length;
  const pipelineTotal = columns.reduce((n, c) => n + c.leads.length, 0);
  const action = (
    <button
      type="button"
      className="btn btn-primary"
      disabled={!approved || !!running || starting}
      onClick={discover}
    >
      <Icon name="search" size={17} />
      {running || starting ? "Finding opportunities…" : "Find opportunities"}
    </button>
  );
  const requestError =
    error ||
    profile.error?.message ||
    leads.error?.message ||
    runs.error?.message;
  function switchBusiness() {
    const url = new URL(window.location.href);
    url.searchParams.delete("as");
    window.history.replaceState(null, "", url.toString());
    setUser("");
  }
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main-content">
        Skip to opportunities
      </a>
      <aside className="workspace-sidebar">
        <a
          href="#main-content"
          className="brand-link"
          aria-label="Tyson, your personal sales agent"
        >
          <Brand />
        </a>
        <div className="workspace-nav">
          <div className="workspace-label">YOUR WORKSPACE</div>
          <button
            type="button"
            className={`nav-link ${view === "opportunities" ? "active" : ""}`}
            aria-current={view === "opportunities" ? "page" : undefined}
            onClick={() => setView("opportunities")}
          >
            <Icon name="search" size={19} />
            Opportunities<span className="nav-count">{all.length}</span>
          </button>
          <button
            type="button"
            className={`nav-link ${view === "queue" ? "active" : ""}`}
            aria-current={view === "queue" ? "page" : undefined}
            onClick={() => setView("queue")}
          >
            <Icon name="mail" size={19} />
            Approval queue<span className="nav-count">{queueCount}</span>
          </button>
          <button
            type="button"
            className={`nav-link ${view === "analytics" ? "active" : ""}`}
            aria-current={view === "analytics" ? "page" : undefined}
            onClick={() => setView("analytics")}
          >
            <Icon name="pipeline" size={19} />
            Analytics
          </button>
          <BusinessDrawer
            open={businessOpen}
            onOpen={() => setBusinessOpen(true)}
            onClose={() => setBusinessOpen(false)}
          >
            <BusinessProfile profile={p} onSaved={profile.reload} />
          </BusinessDrawer>
        </div>
        <section className="pipeline-summary" aria-label="Pipeline summary">
          <div className="pipeline-title">
            <span>
              <Icon name="pipeline" size={17} />
              Pipeline
            </span>
            <strong>{pipelineTotal}</strong>
          </div>
          <p>Your conversations at a glance.</p>
          <div className="pipeline-mini-bar" aria-hidden="true">
            {STAGE_ORDER.map((s, i) => (
              <span
                key={s}
                style={{
                  flex: columns.find((c) => c.stage === s)?.leads.length ?? 0,
                  background: [
                    "#adc0e8",
                    "#7597d8",
                    "#4879c7",
                    "#3a9789",
                    "#286c52",
                    "#c8cdd6",
                  ][i],
                }}
              />
            ))}
          </div>
          <div className="pipeline-stages">
            {STAGE_ORDER.map((s, i) => {
              const count =
                columns.find((c) => c.stage === s)?.leads.length ?? 0;
              return (
                <button
                  type="button"
                  key={s}
                  className={stage === s ? "selected" : ""}
                  aria-pressed={stage === s}
                  onClick={() => {
                    setStage((v) => (v === s ? null : s));
                    setFilter("all");
                    setSearch("");
                  }}
                >
                  <span className={`stage-marker stage-${i}`} />
                  <span>{STAGE_LABEL[s]}</span>
                  <strong>{count}</strong>
                </button>
              );
            })}
          </div>
          {stage && (
            <button
              type="button"
              className="text-link !text-xs mt-4"
              onClick={() => setStage(null)}
            >
              Show all opportunities
            </button>
          )}
          {pipeline.error && (
            <p className="text-xs text-redline mt-3" role="alert">
              Pipeline unavailable
            </p>
          )}
        </section>
        <div className="sidebar-footer">
          <details className="workspace-settings">
            <summary>
              <Icon name="settings" size={17} />
              Integrations
            </summary>
            <div className="settings-content">
              {Object.entries(me.data?.providers ?? {}).map(([k, v]) => (
                <div className="provider-row" key={k}>
                  <span className="capitalize">{k}</span>
                  <span className={v === "live" ? "text-open" : "text-ink-3"}>
                    {v === "live" ? "Live" : "Simulated"}
                  </span>
                </div>
              ))}
            </div>
          </details>
          <div className="business-account">
            <span className="avatar">
              {(p?.companyName || "Your business").slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{p?.companyName || "Your business"}</strong>
              <span>Supplier workspace</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Switch business"
              title="Switch business"
              onClick={switchBusiness}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <details className="credits-menu">
            <summary>
              <Icon name="credit" size={18} />
              <span>Workspace credits</span>
              <strong>{me.data?.credits.available ?? "–"}</strong>
              <span className="credits-spent">
                {me.data?.credits.spent ?? 0} used
              </span>
            </summary>
            <div className="credits-popover">
              <h3>Credit history</h3>
              <p className="section-description">
                {me.data?.credits.available ?? "–"} remaining of{" "}
                {me.data?.credits.granted ?? "–"}
              </p>
              <p className="field-help mb-4">
                Drafts are free. Verification: 3 credits if valid. Sending and
                re-evaluation: 1 each.
              </p>
              {ledger.error && (
                <p role="alert" className="text-sm text-redline">
                  {ledger.error.message}
                </p>
              )}
              <ul>
                {ledger.data?.entries.slice(0, 12).map((e) => (
                  <li key={e.id}>
                    <span>
                      {
                        {
                          grant: "Demo allowance",
                          lead_enriched: "Contact verification",
                          outreach_sent: "Outreach sent",
                          graph_query_evaluated: "Re-evaluation",
                        }[e.operation]
                      }
                      <small>
                        {e.status === "failed" ? "Not charged" : e.status}
                      </small>
                    </span>
                    <strong className={e.credits > 0 ? "text-open" : ""}>
                      {e.credits > 0 ? "+" : ""}
                      {e.credits}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          </details>
          <div className="topbar-company">
            <Icon name="building" size={17} />
            <span>{p?.companyName || "Your workspace"}</span>
            <button
              className="text-link"
              type="button"
              onClick={() => setBusinessOpen(true)}
            >
              Edit business
            </button>
            <button
              className="btn btn-small topbar-exit"
              type="button"
              onClick={switchBusiness}
              title="Sign out and switch business"
            >
              <Icon name="logout" size={15} />
              Exit
            </button>
          </div>
        </header>
        {view === "analytics" ? (
          <main id="main-content" className="workspace-canvas single">
            <AnalyticsPanel />
          </main>
        ) : view === "queue" ? (
          <main id="main-content" className="workspace-canvas single">
            <QueuePanel onOpenLead={openLead} />
          </main>
        ) : (
        <div className="workspace-canvas">
          <main id="main-content" className="opportunities-main">
            <header className="dashboard-heading">
              <div>
                <p className="eyebrow">YOUR NEXT CONVERSATION STARTS HERE</p>
                <h1>Opportunities</h1>
                <p>Find contractors who need what you sell.</p>
              </div>
              {action}
            </header>
            {profile.data && !approved && (
              <div className="profile-caution" role="alert">
                <span className="caution-sign">
                  <Icon name="warning" size={23} />
                </span>
                <div>
                  <strong>
                    {p
                      ? "Your buyer profile needs approval"
                      : "Create your buyer profile"}
                  </strong>
                  <p>
                    {p
                      ? "Review your suggested buyers before starting discovery."
                      : "Tell us about your business so we can find the right matches."}
                  </p>
                </div>
                <div className="caution-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setBusinessOpen(true)}
                  >
                    {p ? "Review profile" : "Set up profile"}
                  </button>
                  {p && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={approving}
                      onClick={approveFromBanner}
                    >
                      <Icon name="check" size={16} />
                      {approving ? "Approving…" : "Approve profile"}
                    </button>
                  )}
                </div>
              </div>
            )}
            {requestError && (
              <p className="notice notice-error mb-5" role="alert">
                {requestError}
              </p>
            )}
            {running && run && (
              <div className="mb-6">
                <DiscoveryProgress run={run} />
              </div>
            )}
            <section
              ref={resultsRef}
              className="matched-opportunities"
              aria-label="Matched opportunities"
            >
              <div className="results-heading">
                <div>
                  <h2>
                    Matched opportunities <span>{all.length}</span>
                  </h2>
                  <p>{ready} ready to pursue</p>
                </div>
                <details className="search-settings" open={settingsOpen || undefined}>
                  <summary>
                    <Icon name="settings" size={16} />
                    Search settings
                  </summary>
                  <div className="search-settings-panel">
                    <ServiceAreaMap value={p?.serviceArea ?? null} onSaved={() => void profile.reload()} />
                    <label>
                      <span className="form-label">Sources</span>
                      <select
                        className="field"
                        value={mode}
                        onChange={(e) =>
                          setMode(e.target.value as "live" | "seed")
                        }
                      >
                        <option value="live">
                          Web search + Oakland examples
                        </option>
                        <option value="seed">Oakland examples only</option>
                      </select>
                    </label>
                    <label>
                      <span className="form-label">
                        Demo replay time (optional)
                      </span>
                      <input
                        className="field"
                        type="datetime-local"
                        value={replay}
                        onChange={(e) => setReplay(e.target.value)}
                      />
                      <span className="field-help">
                        Uses your browser’s local timezone.
                      </span>
                    </label>
                  </div>
                </details>
              </div>
              <div className="results-filters">
                <label className="search-box">
                  <Icon name="search" size={17} />
                  <input
                    className="field"
                    aria-label="Search opportunities"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search companies or projects"
                  />
                </label>
                <div className="filter-pills" aria-label="Filter opportunities">
                  {(["all", "ready", "other"] as const).map((f) => (
                    <button
                      type="button"
                      key={f}
                      aria-pressed={filter === f}
                      className={filter === f ? "active" : ""}
                      onClick={() => {
                        setFilter(f);
                        setStage(null);
                      }}
                    >
                      {f === "all"
                        ? "All matches"
                        : f === "ready"
                          ? "Ready to pursue"
                          : "Closed & review"}
                    </button>
                  ))}
                </div>
              </div>
              {stage && (
                <div className="stage-filter">
                  <span>Pipeline: {STAGE_LABEL[stage]}</span>
                  <button
                    type="button"
                    aria-label="Clear pipeline filter"
                    onClick={() => setStage(null)}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </div>
              )}
              {!leads.data && !leads.error ? (
                <p className="text-sm text-ink-2 p-6" role="status">
                  Loading opportunities…
                </p>
              ) : rows.length ? (
                <div className="match-list">
                  {rows.map((l) => (
                    <OpportunityCard
                      key={l.id}
                      lead={l}
                      initiallyOpen={initialLead === l.id}
                    />
                  ))}
                </div>
              ) : (
                <div className="panel">
                  <EmptyState
                    title={
                      all.length
                        ? "No matching opportunities"
                        : running
                          ? "Finding your next customer"
                          : "Your next opportunity is waiting"
                    }
                    description={
                      all.length
                        ? "Try another search or clear your filters."
                        : running
                          ? "We’re finding requests that match your business."
                          : approved
                            ? "Find real contractor requests, then prepare outreach right here."
                            : "Review your buyer profile to start finding matches."
                    }
                    action={
                      all.length ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setSearch("");
                            setFilter("all");
                            setStage(null);
                          }}
                        >
                          Clear filters
                        </button>
                      ) : approved ? (
                        action
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setBusinessOpen(true)}
                        >
                          Review buyer profile
                        </button>
                      )
                    }
                  />
                </div>
              )}
            </section>
            {run && !running && (
              <div className="completed-search">
                <DiscoveryProgress run={run} />
                {run.status === "failed" && (
                  <p className="notice notice-error mt-3" role="alert">
                    {run.error || "Search couldn’t finish. Please try again."}
                  </p>
                )}
              </div>
            )}
          </main>
          <aside
            className={`competition-sidebar ${competitionVisible ? "" : "rail-collapsed"}`}
            aria-label="Competition"
          >
            <button
              type="button"
              className="competition-heading"
              aria-expanded={competitionVisible}
              aria-controls="competition-list"
              onClick={() => setCompetitionVisible((v) => !v)}
            >
              <Icon name="globe" size={19} />
              <span>Competition</span>
              <span className="competition-count">
                {competitors.data?.competitors.length ?? 0}
              </span>
            </button>
            <div id="competition-list" hidden={!competitionVisible}>
              <p className="competition-hint">Hover a company to explore.</p>
              {competitors.error && (
                <p className="text-sm text-redline" role="alert">
                  {competitors.error.message}
                </p>
              )}
              {competitors.data?.competitors.length ? (
                competitors.data.competitors.map((c) => (
                  <HoverAccordion key={c.id} title={c.name}>
                    <span className="chip tone-muted capitalize mb-3">
                      {c.category}
                    </span>
                    <p className="competitor-description">{c.positioning}</p>
                    <p className="competitor-description mt-3">
                      <strong>Pricing: </strong>
                      {c.pricing}
                    </p>
                    {c.differentiators.length > 0 && (
                      <details className="mt-4 text-xs text-ink-2">
                        <summary>Key differences</summary>
                        <p className="mt-2">{c.differentiators.join("; ")}</p>
                      </details>
                    )}
                    <a
                      href={c.citation.url}
                      className="text-link inline-block mt-4"
                      target="_blank"
                      rel="noreferrer"
                    >
                      View source
                    </a>
                  </HoverAccordion>
                ))
              ) : (
                <div className="competition-empty">
                  <Icon name="globe" size={25} />
                  <p>Your market landscape will appear after discovery.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
        )}
      </div>
    </div>
  );
}
