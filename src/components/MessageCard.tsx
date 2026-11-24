"use client";
import { useEffect, useState } from "react";
import { approvalHash, formatInZone, type Message } from "@/contract";
import { api } from "@/lib/api";
import { Icon } from "./ui";

const TONE: Record<Message["status"], string> = {
  draft: "tone-review",
  approved: "tone-open",
  rejected: "tone-closed",
  sent: "bg-spec-2 text-spec",
  failed: "tone-closed",
};
export function MessageCard({
  m,
  act,
  disabled = false,
}: {
  m: Message;
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(m.subject);
  const [body, setBody] = useState(m.body);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!editing) {
      setSubject(m.subject);
      setBody(m.body);
    }
  }, [m.revision, editing, m.subject, m.body]);
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      return await act(fn, ok);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="message-card">
      <header>
        <span className="flex items-center gap-2">
          <Icon name="mail" size={16} />
          {m.channel === "email" ? "Email" : "LinkedIn"} · Touch {m.step} ·
          Variant {m.variant}
        </span>
        <span className={`chip ${TONE[m.status]}`}>
          {m.status === "draft"
            ? "Needs your approval"
            : m.status === "approved"
              ? "Approved to send"
              : m.status === "sent"
                ? "Sent"
                : m.status === "rejected"
                  ? "Rejected"
                  : "Delivery failed"}
        </span>
      </header>
      <div className="message-body">
        <div className="text-sm text-ink-2 mb-5">
          To <strong className="font-medium text-ink">{m.recipient}</strong>
          <p className="text-xs mt-1">{m.recipientLabel}</p>
        </div>
        {m.staleReason && (
          <p className="notice notice-error mb-5">
            This draft needs updating: {m.staleReason}
          </p>
        )}
        {editing ? (
          <div className="space-y-4">
            <label className="block">
              <span className="form-label">Subject</span>
              <input
                className="field"
                value={subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="form-label">Message</span>
              <textarea
                className="field min-h-64"
                value={body}
                maxLength={5000}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <p className="field-help">
              Saving an edit returns the message to draft. Review and approve it
              again before sending.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !subject.trim() || !body.trim()}
                onClick={async () => {
                  if (
                    await run(
                      () =>
                        api("reviseMessage", {
                          params: { messageId: m.id },
                          body: {
                            subject,
                            body,
                            recipient: m.recipient,
                            channel: m.channel,
                          },
                        }),
                      "Edits saved. Review and approve the updated draft.",
                    )
                  )
                    setEditing(false);
                }}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {m.channel === "email" && <h3>{m.subject}</h3>}
            <pre>{m.body}</pre>
          </>
        )}
        {m.rejection && (
          <p className="text-sm text-redline mt-5">
            Rejected: {m.rejection.reason}
          </p>
        )}
        {m.approval && (
          <p className="text-xs text-open mt-5">
            Approved by {m.approval.by.name} · {formatInZone(m.approval.at)}
          </p>
        )}
        {m.delivery && (
          <p className="text-xs text-spec mt-5">
            {m.delivery.mode === "live"
              ? "Delivered to the test inbox"
              : m.delivery.mode === "simulated"
                ? "Simulated delivery"
                : "Manual handoff recorded"}{" "}
            · {formatInZone(m.delivery.at)}
          </p>
        )}
        <details>
          <summary>Sources & review details</summary>
          <div className="space-y-2 mt-3">
            <p>
              Security review: {m.securityCheck.passed ? "Passed" : "Flagged"}.{" "}
              {m.securityCheck.findings.join("; ")}
            </p>
            <p>
              Revision {m.revision}
              {m.approval
                ? ` · Approved revision ${m.approval.revision} · ${m.approval.hash.slice(0, 8)}`
                : ""}
            </p>
            {m.groundedOn.map((u) => (
              <a
                key={u}
                href={u}
                className="text-link block break-all"
                target="_blank"
                rel="noreferrer"
              >
                {new URL(u).hostname}
              </a>
            ))}
            {m.delivery && (
              <p>
                {m.delivery.provider} · {m.delivery.note}
              </p>
            )}
          </div>
        </details>
      </div>
      {!editing && (
        <footer>
          {m.status === "draft" && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  busy || disabled || !!m.staleReason || !m.securityCheck.passed
                }
                onClick={() =>
                  run(
                    () =>
                      api("decideMessage", {
                        params: { messageId: m.id },
                        body: {
                          decision: "approve",
                          revision: m.revision,
                          hash: approvalHash(m),
                        },
                      }),
                    "Message approved. You can now send it to the test inbox.",
                  )
                }
              >
                <Icon name="check" size={17} />
                Approve message
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setRejecting((v) => !v)}
              >
                Reject
              </button>
            </>
          )}
          {["draft", "approved", "rejected"].includes(m.status) && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Edit message
            </button>
          )}
          {m.status === "approved" && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || disabled || !!m.staleReason}
              onClick={() =>
                run(
                  () =>
                    api("sendMessage", {
                      params: { messageId: m.id },
                      body: { idempotencyKey: crypto.randomUUID() },
                    }),
                  "Delivery recorded. See the message’s delivery status below.",
                )
              }
            >
              <Icon name="mail" size={17} />
              {busy
                ? "Sending…"
                : m.channel === "linkedin"
                  ? "Record manual handoff · 1 credit"
                  : "Send to test inbox · 1 credit"}
            </button>
          )}
          {m.status === "sent" && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    api("simulateReply", {
                      params: { messageId: m.id },
                      body: {},
                    }),
                  "Simulated reply logged. The pipeline has been updated.",
                )
              }
            >
              Simulate a reply
            </button>
          )}
          {rejecting && m.status === "draft" && (
            <div className="flex gap-2 flex-wrap basis-full pt-3">
              <label className="flex-1 min-w-48">
                <span className="sr-only">Reason for rejection</span>
                <input
                  className="field"
                  placeholder="Why should this message be revised?"
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || !reason.trim()}
                onClick={async () => {
                  if (
                    await run(
                      () =>
                        api("decideMessage", {
                          params: { messageId: m.id },
                          body: {
                            decision: "reject",
                            revision: m.revision,
                            hash: approvalHash(m),
                            reason,
                          },
                        }),
                      "Message rejected.",
                    )
                  )
                    setRejecting(false);
                }}
              >
                Confirm rejection
              </button>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}
