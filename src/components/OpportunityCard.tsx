"use client";
import { useEffect, useRef, useState } from "react";
import {
  ContractError,
  formatInZone,
  STAGE_LABEL,
  STAGE_ORDER,
  type Contact,
  type LeadSummary,
  type Stage,
} from "@/contract";
import { api, refreshAll } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { cutoffOf, ScoreBar, ScoreDetail, StatusChip } from "./bits";
import { MessageCard } from "./MessageCard";
import { GraphPath } from "./GraphPath";
import { Icon, Notice } from "./ui";
import { ProgressBar, useDraftProgress } from "./Progress";

export function OpportunityCard({
  lead,
  initiallyOpen = false,
}: {
  lead: LeadSummary;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (initiallyOpen) {
      setOpen(true);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initiallyOpen]);
  const actionable = lead.qualification.status === "actionable";
  return (
    <article
      ref={ref}
      id={`opportunity-${lead.id}`}
      className={`match-card ${open ? "is-open" : ""}`}
    >
      <div className="match-summary">
        <div className="match-identity">
          <div className="flex items-center gap-3 flex-wrap">
            <h3>{lead.contractorName}</h3>
            <StatusChip q={lead.qualification} />
          </div>
          <p className="match-project">
            {lead.projectNumber && <strong>{lead.projectNumber} · </strong>}
            {lead.projectTitle}
          </p>
          <p className="match-scope">{lead.scopes.join("; ")}</p>
          <div className="match-meta">
            <span className="capitalize">{lead.evidenceStrength} evidence</span>
            <span>·</span>
            <span>{STAGE_LABEL[lead.stage]}</span>
            <span>·</span>
            <span>
              {lead.origin === "seed" ? "Curated example" : "Web discovery"}
            </span>
          </div>
        </div>
        <div className="match-fit">
          <span className="column-label">Fit score</span>
          <ScoreBar s={lead.score} />
        </div>
        <div className="match-deadline">
          <span className="column-label">Your supplier deadline</span>
          <strong>{cutoffOf(lead)}</strong>
          <button
            type="button"
            className={`btn ${actionable ? "btn-primary" : ""}`}
            aria-expanded={open}
            aria-controls={`outreach-${lead.id}`}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "close" : "mail"} size={16} />
            {open ? "Close outreach" : "Prepare outreach"}
          </button>
        </div>
      </div>
      {open && (
        <div id={`outreach-${lead.id}`} className="inline-outreach">
          <Outreach leadId={lead.id} />
        </div>
      )}
    </article>
  );
}
function Outreach({ leadId }: { leadId: string }) {
  const {
    data: lead,
    error,
    reload,
  } = usePoll(() => api("getLead", { params: { leadId } }), [leadId], 3000);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftComplete, setDraftComplete] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const [replay, setReplay] = useState("");
  const guard = useRef(false);
  const percent = useDraftProgress(drafting, draftComplete);
  async function act(fn: () => Promise<unknown>, ok?: string) {
    if (guard.current) return false;
    guard.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      await reload();
      refreshAll();
      if (ok) setNotice({ error: false, text: ok });
      return true;
    } catch (e) {
      const ce = e as ContractError;
      setNotice({
        error: true,
        text:
          ce.code === "insufficient_credits"
            ? `Not enough credits. ${ce.message}`
            : ce.message,
      });
      refreshAll();
      return false;
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function draft(channel: "email" | "linkedin", variant: "A" | "B") {
    if (guard.current) return;
    setDraftComplete(false);
    setDrafting(true);
    try {
      const done = await act(
        () =>
          api("draftMessage", {
            params: { leadId },
            body: { channel, variant },
          }),
        "Draft ready. Review and approve before sending.",
      );
      setDraftComplete(done);
    } finally {
      setDrafting(false);
    }
  }
  async function sequence() {
    if (guard.current) return;
    setDraftComplete(false);
    setDrafting(true);
    try {
      const done = await act(
        () => api("draftSequence", { params: { leadId }, body: { variant: "A" } }),
        "Three drafts ready: email (day 0), LinkedIn (day 1), follow-up (day 3). Approve each before sending.",
      );
      setDraftComplete(done);
    } finally {
      setDrafting(false);
    }
  }
  if (error) return <Notice error>{error.message}</Notice>;
  if (!lead) return <ProgressBar label="Loading outreach workspace" />;
  const actionable = lead.qualification.status === "actionable";
  return (
    <div className="outreach-workspace">
      {notice && <Notice error={notice.error}>{notice.text}</Notice>}
      {!actionable && (
        <div className="caution-inline">
          <Icon name="warning" size={19} />
          <p>
            Outreach paused: {lead.qualification.label}. You can still review
            this match.
          </p>
        </div>
      )}
      <div className="outreach-columns">
        <div className="outreach-compose">
          <div className="outreach-heading">
            <div>
              <h4>Prepare your outreach</h4>
              <p>A relevant conversation starts with a good first message.</p>
            </div>
            <span className="chip tone-muted">Drafting is free</span>
          </div>
          <div className="outreach-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !actionable}
              onClick={() => draft("email", "A")}
            >
              <Icon name="spark" size={16} />
              {drafting ? "Preparing draft…" : "Draft email"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !actionable}
              onClick={() => draft("email", "B")}
            >
              Alternative email
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !actionable}
              onClick={() => draft("linkedin", "A")}
            >
              LinkedIn note
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !actionable}
              title="Email today, LinkedIn note on day 1, follow-up email on day 3. Each touch needs your approval."
              onClick={() => sequence()}
            >
              3-touch sequence
            </button>
          </div>
          {(drafting || draftComplete) && (
            <div className="draft-progress">
              <ProgressBar
                value={percent}
                label={
                  draftComplete && !drafting
                    ? "Draft complete"
                    : "Builder · Preparing your outreach"
                }
                caption={
                  drafting
                    ? "Estimated progress. Completion is confirmed when the draft is ready."
                    : "100% ready for your review."
                }
              />
            </div>
          )}
          <div className="message-stack">
            {lead.messages.map((m) => (
              <MessageCard
                key={m.id}
                m={m}
                act={act}
                disabled={busy || !actionable}
              />
            ))}
            {lead.messages.length === 0 && !drafting && (
              <div className="draft-placeholder">
                <Icon name="mail" size={25} />
                <p>Your draft will appear here.</p>
                <span>Review and approve it here before anything is sent.</span>
              </div>
            )}
          </div>
        </div>
        <aside className="outreach-contacts">
          <div className="company-card">
            <span className="column-label">Company</span>
            <strong>{lead.company?.legalName ?? lead.contractorName}</strong>
            {lead.company ? (
              <>
                <p>{lead.company.headquarters ?? "Headquarters unknown"}</p>
                <p>
                  {[lead.company.industry, lead.company.employees ? `${lead.company.employees} employees` : null, lead.company.naics ? `NAICS ${lead.company.naics}` : null]
                    .filter(Boolean)
                    .join(" · ") || "No firmographics found"}
                </p>
                <p className="flex gap-3 flex-wrap mt-1">
                  <span className={`chip ${lead.company.domainVerified ? "tone-open" : "tone-muted"}`}>
                    {lead.company.domainVerified ? `${lead.company.domain} verified` : `${lead.company.domain} not found`}
                  </span>
                  {lead.company.linkedinUrl && (
                    <a className="text-link !text-xs" href={lead.company.linkedinUrl} target="_blank" rel="noreferrer">
                      LinkedIn page
                    </a>
                  )}
                </p>
                <p className="field-help">{lead.company.provider}</p>
              </>
            ) : (
              <>
                <p>{lead.contractor.domain ?? "No company domain published"}</p>
                {lead.contractor.domain && (
                  <button
                    type="button"
                    className="btn btn-small mt-2"
                    disabled={busy}
                    onClick={() => act(() => api("enrichCompany", { params: { leadId }, body: {} }), "Company details added. No credits used.")}
                  >
                    Look up company · free
                  </button>
                )}
              </>
            )}
          </div>
          <h4>Contacts</h4>
          <p className="section-description">
            Published details. Verify before reaching out.
          </p>
          {lead.contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              disabled={busy || !actionable}
              verify={() =>
                act(
                  () =>
                    api("verifyContact", {
                      params: { leadId, contactId: c.id },
                      body: { idempotencyKey: crypto.randomUUID() },
                    }),
                  "Contact verification complete.",
                )
              }
            />
          ))}
          {!lead.contacts.length && (
            <p className="text-sm text-ink-3 mt-4">
              No contact published in this notice.
            </p>
          )}
          <label className="stage-control">
            <span className="form-label">Pipeline stage</span>
            <select
              className="field"
              value={lead.stage}
              disabled={busy}
              onChange={(e) =>
                act(() =>
                  api("moveLead", {
                    params: { leadId },
                    body: { stage: e.target.value as Stage },
                  }),
                )
              }
            >
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </aside>
      </div>
      <details className="match-evidence">
        <summary>Match details & source evidence</summary>
        <div className="evidence-grid">
          <div>
            <h4>Why this matches</h4>
            <ul className="space-y-4 mt-4">
              {lead.scopeMatches.map((m, i) => (
                <li key={i}>
                  <strong>{m.service}</strong>
                  <p className="text-sm text-ink-2 mt-1">
                    Requested: {m.scope}
                  </p>
                  <a
                    className="text-link"
                    href={m.citation.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View source notice
                  </a>
                  <blockquote className="text-sm text-ink-3 border-l-2 border-rule pl-3 mt-2">
                    {m.citation.excerpt}
                  </blockquote>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <ScoreDetail s={lead.score} />
            </div>
          </div>
          <div>
            <h4>Response & deadlines</h4>
            <p className="text-sm text-ink-2 mt-3">{lead.responseMethod}</p>
            <ul className="space-y-3 mt-4">
              {lead.deadlines.map((d, i) => (
                <li key={i} className="text-sm">
                  <span className="column-label">
                    {d.kind === "owner_bid_opening"
                      ? "Utility bid opening · prime bidders"
                      : "Your supplier deadline"}
                  </span>
                  <strong>{d.at ? formatInZone(d.at) : "Not published"}</strong>
                  <p className="text-xs text-ink-3">{d.derivation}</p>
                  <a
                    className="text-link !text-xs"
                    href={d.citation.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source
                  </a>
                </li>
              ))}
            </ul>
            {lead.requirements.map((r, i) => (
              <p className="text-sm text-ink-2 mt-3" key={i}>
                {r.credential || r.text} ·{" "}
                {r.supplierHas === "yes"
                  ? "Held"
                  : r.supplierHas === "no"
                    ? "Missing"
                    : "Needs checking"}
              </p>
            ))}
            <div className="flex gap-2 flex-wrap mt-5">
              {(
                [
                  "quote_requested",
                  "drawings_received",
                  "quote_submitted",
                ] as const
              ).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="btn btn-small"
                  disabled={busy || lead.milestones.some((x) => x.key === m)}
                  onClick={() =>
                    act(() =>
                      api("moveLead", {
                        params: { leadId },
                        body: { milestone: m },
                      }),
                    )
                  }
                >
                  {m.replace(/_/g, " ")}
                  {lead.milestones.some((x) => x.key === m) ? " ✓" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
        <details className="mt-6">
          <summary>Connected evidence & re-evaluation</summary>
          <div className="mt-4">
            <GraphPath g={lead.graphPath} />
          </div>
          <div className="replay-controls">
            <label>
              <span className="form-label">Demo replay time (optional)</span>
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
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    api("evaluateLead", {
                      params: { leadId },
                      body: {
                        idempotencyKey: crypto.randomUUID(),
                        asOf: replay
                          ? new Date(replay).toISOString()
                          : undefined,
                      },
                    }),
                  "Opportunity re-evaluated. 1 credit used.",
                )
              }
            >
              Re-evaluate · 1 credit
            </button>
          </div>
        </details>
        <details className="mt-5">
          <summary>Activity & credit usage</summary>
          <p className="text-sm mt-3">
            {lead.billing.spent} credits used on this opportunity.
          </p>
          <ul className="text-sm space-y-3 mt-4">
            {lead.activity.map((a) => (
              <li key={a.id}>
                <span className="chip tone-muted mr-2">{a.actor.name}</span>
                {a.summary}
              </li>
            ))}
          </ul>
        </details>
      </details>
    </div>
  );
}
function ContactCard({
  contact: c,
  disabled,
  verify,
}: {
  contact: Contact;
  disabled: boolean;
  verify: () => Promise<boolean>;
}) {
  const v = c.verification;
  return (
    <div className={`contact-card ${c.isTestContact ? "test" : ""}`}>
      {c.isTestContact && (
        <span className="column-label text-spec">Demo test contact</span>
      )}
      <strong>{c.name ?? c.email ?? "Published contact"}</strong>
      <p>
        {c.kind === "shared_mailbox"
          ? "Shared mailbox"
          : (c.title ?? "Named contact")}
      </p>
      <p className="mt-2 break-all">{c.email ?? "No email published"}</p>
      {c.phone && <p>{c.phone}</p>}
      {c.linkedinUrl && (
        <a className="text-link !text-xs" href={c.linkedinUrl} target="_blank" rel="noreferrer">
          LinkedIn profile
        </a>
      )}
      <span
        className={`chip mt-3 ${v.status === "valid" ? "tone-open" : v.status === "invalid" || v.status === "blocked" ? "tone-closed" : "tone-muted"}`}
      >
        {v.status === "valid"
          ? "Verified"
          : v.status === "unchecked"
            ? "Not yet verified"
            : v.status.replace(/_/g, " ")}
      </span>
      {c.email && v.status !== "valid" && (
        <button
          type="button"
          className="btn btn-small"
          disabled={disabled}
          onClick={() => verify()}
        >
          Verify · 3 credits if valid
        </button>
      )}
      <details className="text-xs mt-3 text-ink-3">
        <summary>Verification details</summary>
        <p className="mt-2">{v.note}</p>
        {!c.isTestContact && (
          <a
            className="text-link !text-xs"
            href={c.published.url}
            target="_blank"
            rel="noreferrer"
          >
            Published source
          </a>
        )}
      </details>
    </div>
  );
}
