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
  const [reviewed, setReviewed] = useState<string[]>([]);
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
  const remaining = items.filter((i) => !reviewed.includes(i.message.id));
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
      {remaining.length === 0 ? (
        <div className="panel draft-placeholder">
          <p>Nothing waiting for approval.</p>
          <span>Drafts you prepare on an opportunity appear here.</span>
        </div>
      ) : (
        <div className={`queue-list queue-deck ${remaining.length > 1 ? "has-next" : ""}`}>
          <p className="queue-count">{remaining.length} remaining</p>
          {remaining.slice(0, 1).map(({ message, lead }) => (
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
              <MessageCard m={message} queueMode act={async (fn, ok) => {
                const success = await act(fn, ok);
                if (success) {
                  const latest = await api("getQueue");
                  const updated = latest.items.find((i) => i.message.id === message.id);
                  if (!updated || updated.message.status !== message.status) {
                    setReviewed((ids) => [...ids, message.id]);
                  }
                }
                return success;
              }} disabled={busy || lead.qualification.status !== "actionable"} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
