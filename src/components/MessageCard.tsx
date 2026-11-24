"use client";
import { useEffect, useState } from "react";
import { approvalHash, formatInZone, type Message } from "@/contract";
import { api } from "@/lib/api";

const TONE: Record<Message["status"], string> = {
  draft: "tone-review",
  approved: "tone-open",
  rejected: "tone-closed",
  sent: "bg-spec-2 text-spec",
  failed: "tone-closed",
};

export function MessageCard({ m, act }: { m: Message; act: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(m.subject);
  const [body, setBody] = useState(m.body);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!editing) {
      setSubject(m.subject);
      setBody(m.body);
    }
  }, [m.revision, editing, m.subject, m.body]);

  return (
    <article className="border border-rule rounded-md">
      <header className="flex justify-between items-center gap-2 px-4 py-2 border-b border-rule-2 text-sm flex-wrap">
        <span>
          <b>Step {m.step}</b> · {m.channel === "email" ? "Email" : "LinkedIn"} · variant {m.variant} · revision {m.revision}
        </span>
        <span className={`chip ${TONE[m.status]}`}>{m.status === "draft" ? "Awaiting approval" : m.status}</span>
      </header>
      <div className="px-4 py-3 space-y-2 text-sm">
        <div className="text-ink-2">
          To <b className="text-ink">{m.recipient}</b>
          <div className="text-xs">{m.recipientLabel}</div>
        </div>
        {editing ? (
          <>
            <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
            <textarea className="field min-h-40" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Body" />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await act(() => api("reviseMessage", { params: { messageId: m.id }, body: { subject, body, recipient: m.recipient, channel: m.channel } }), "Saved as a new revision. Approve it again before sending.");
                  setEditing(false);
                }}
              >
                Save revision
              </button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            {m.channel === "email" && <div className="font-semibold">{m.subject}</div>}
            <pre className="whitespace-pre-wrap font-sans text-sm bg-paper rounded p-3">{m.body}</pre>
          </>
        )}
        <div className="text-xs text-ink-2">
          Security check: {m.securityCheck.passed ? "passed" : "flagged"} — {m.securityCheck.findings.join("; ")}
        </div>
        <div className="text-xs text-ink-3">Grounded on: {m.groundedOn.map((u) => <a key={u} href={u} className="underline mr-2" target="_blank" rel="noreferrer">{new URL(u).hostname}</a>)}</div>
        {m.approval && <div className="text-xs text-open">Approved by {m.approval.by.name} {formatInZone(m.approval.at)} · revision {m.approval.revision} · hash {m.approval.hash.slice(0, 8)}</div>}
        {m.rejection && <div className="text-xs text-redline">Rejected: {m.rejection.reason}</div>}
        {m.delivery && <div className="text-xs text-spec">{m.delivery.mode === "live" ? "Delivered" : m.delivery.mode === "simulated" ? "Simulated delivery" : "Manual handoff"} via {m.delivery.provider} {formatInZone(m.delivery.at)} · {m.delivery.note}</div>}
      </div>
      {!editing && (
        <footer className="flex gap-2 flex-wrap px-4 py-3 border-t border-rule-2 items-center">
          {m.status === "draft" && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => act(() => api("decideMessage", { params: { messageId: m.id }, body: { decision: "approve", revision: m.revision, hash: approvalHash(m) } }), "Approved this exact revision")}>Approve</button>
              <input className="field !w-48 !py-1" placeholder="Reason to reject" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="btn btn-danger" disabled={!reason.trim()} onClick={() => act(() => api("decideMessage", { params: { messageId: m.id }, body: { decision: "reject", revision: m.revision, hash: approvalHash(m), reason } }))}>Reject</button>
            </>
          )}
          {(m.status === "draft" || m.status === "approved" || m.status === "rejected") && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
          )}
          {m.status === "approved" && (
            <button type="button" className="btn btn-primary" onClick={() => act(() => api("sendMessage", { params: { messageId: m.id }, body: { idempotencyKey: crypto.randomUUID() } }), "Sent to the test inbox (1 credit)")}>
              {m.channel === "linkedin" ? "Record manual handoff · 1 credit" : "Send to test inbox · 1 credit"}
            </button>
          )}
          {m.status === "sent" && (
            <button type="button" className="btn" onClick={() => act(() => api("simulateReply", { params: { messageId: m.id }, body: {} }), "Logged a simulated reply")}>Simulate reply (labeled)</button>
          )}
        </footer>
      )}
    </article>
  );
}
