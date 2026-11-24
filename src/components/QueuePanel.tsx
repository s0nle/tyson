"use client";
import { useRef, useState } from "react";
import type { ContractError } from "@/contract";
import { api, refreshAll } from "@/lib/api";
import { usePoll } from "@/lib/hooks";
import { MessageCard } from "./MessageCard";
import { Notice } from "./ui";

/** Every draft awaiting a decision (or an approved send) across all opportunities. */
export function QueuePanel({ onOpenLead }: { onOpenLead: (leadId: string) => void }) {
  const q = usePoll(() => api("getQueue"), [], 3000);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const guard = useRef(false);
  async function act(fn: () => Promise<unknown>, ok?: string) {
    if (guard.current) return false;
    guard.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      await q.reload();
      refreshAll();
      if (ok) setNotice({ error: false, text: ok });
      return true;
    } catch (e) {
      const ce = e as ContractError;
      setNotice({ error: true, text: ce.code === "insufficient_credits" ? `Not enough credits. ${ce.message}` : ce.message });
      return false;
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  const items = q.data?.items ?? [];
  const awaiting = items.filter((i) => i.message.status === "draft").length;
  return (
    <div className="queue">
      <header className="dashboard-heading">
        <div>
          <h1>Approval queue</h1>
          <p>
            {awaiting} awaiting your decision · {items.length - awaiting} approved and ready to send. Nothing is sent without your approval.
          </p>
        </div>
      </header>
      {notice && <Notice error={notice.error}>{notice.text}</Notice>}
      {q.error && <Notice error>{q.error.message}</Notice>}
      {items.length === 0 ? (
        <div className="panel draft-placeholder">
          <p>Nothing waiting for approval.</p>
          <span>Drafts you prepare on an opportunity appear here.</span>
        </div>
      ) : (
        <div className="queue-list">
          {items.map(({ message, lead }) => (
            <section key={message.id} className="queue-item">
              <div className="queue-lead">
                <button type="button" className="text-link" onClick={() => onOpenLead(lead.id)}>
                  {lead.contractorName}
                </button>
                <span>
                  {lead.projectNumber ?? lead.projectTitle} · step {message.step}
                  {message.sendAfterDays ? ` · day ${message.sendAfterDays}` : ""}
                </span>
              </div>
              <MessageCard m={message} act={act} disabled={busy || lead.qualification.status !== "actionable"} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
