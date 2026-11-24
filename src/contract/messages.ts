import { z } from "zod";
import { Actor, Id, Timestamp } from "./common";

export const Channel = z.enum(["email", "linkedin"]);
export type Channel = z.infer<typeof Channel>;

/**
 * Message (one outbound touch) lifecycle — the HITL gate:
 *   draft    → created by the builder agent or edited by a rep. Never sendable.
 *   approved → a rep approved THIS revision/channel/recipient (approval.hash). Any edit → back to draft.
 *   rejected → terminal for this revision; cannot be sent. Rep may revise (→ draft) to try again.
 *   sent     → provider accepted it (or manual handoff recorded for LinkedIn). Idempotent.
 *   failed   → provider refused; credits released.
 */
export const MessageStatus = z.enum(["draft", "approved", "rejected", "sent", "failed"]);
export type MessageStatus = z.infer<typeof MessageStatus>;

export const Message = z.object({
  id: Id,
  leadId: Id,
  /** Position in the sequence: 1 = first touch. */
  step: z.int().min(1).max(20),
  channel: Channel,
  variant: z.enum(["A", "B"]),
  revision: z.int().min(1),
  subject: z.string(),
  body: z.string(),
  /** Where it will actually go (a team-controlled test inbox in the demo). */
  recipient: z.string(),
  /** Who it is addressed to in the copy, e.g. "Luke Sherman (Estimating Coordinator)". */
  recipientLabel: z.string(),
  status: MessageStatus,
  approval: z
    .object({ hash: z.string(), revision: z.int(), by: Actor, at: Timestamp })
    .nullable(),
  rejection: z.object({ reason: z.string(), by: Actor, at: Timestamp }).nullable(),
  delivery: z
    .object({
      provider: z.string(),
      providerMessageId: z.string().nullable(),
      mode: z.enum(["live", "simulated", "manual_handoff"]),
      at: Timestamp,
      note: z.string(),
    })
    .nullable(),
  /** Source URLs the copy is grounded in. */
  groundedOn: z.array(z.string()),
  /** Security reviewer result for links / destination / attachments. */
  securityCheck: z.object({ passed: z.boolean(), findings: z.array(z.string()) }),
  /** Days after step 1 this touch should go out (sequence cadence). */
  sendAfterDays: z.int().min(0).max(30).default(0),
  /** The value proposition this variant tests, e.g. "Scope match" vs "Local track record". */
  valueProp: z.string().default("Scope match"),
  /** Persona rules applied: tone, max length, CTA. */
  persona: z.string().default(""),
  /** Set when the lead's evidence changed after drafting (e.g. window closed, notice amended). Stale messages cannot be sent. */
  staleReason: z.string().nullable().default(null),
  createdBy: Actor,
  updatedAt: Timestamp,
});
export type Message = z.infer<typeof Message>;

export const DraftRequest = z.object({
  channel: Channel.default("email"),
  variant: z.enum(["A", "B"]).default("A"),
});
export type DraftRequest = z.input<typeof DraftRequest>;

export const ReviseMessageRequest = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  recipient: z.string().min(3).max(200),
  channel: Channel,
});
export type ReviseMessageRequest = z.input<typeof ReviseMessageRequest>;

export const DecideMessageRequest = z
  .object({
    decision: z.enum(["approve", "reject"]),
    /** The revision the rep is looking at; stale views are refused. */
    revision: z.int().min(1),
    /** approvalHash() of what the rep saw; must match the server's computation. */
    hash: z.string(),
    reason: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "reject" && !v.reason?.trim()) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Give a reason when rejecting" });
    }
  });
export type DecideMessageRequest = z.input<typeof DecideMessageRequest>;

export const SequenceRequest = z.object({ variant: z.enum(["A", "B"]).default("A") });
export type SequenceRequest = z.input<typeof SequenceRequest>;
export const SequenceResponse = z.object({ messages: z.array(Message) });

export const SendMessageRequest = z.object({ idempotencyKey: Id });
export type SendMessageRequest = z.input<typeof SendMessageRequest>;

export const SimulateReplyRequest = z.object({
  body: z
    .string()
    .default("Thanks for reaching out. Drawings and the E-series retrofit specs are attached; please send pricing by Monday."),
});
export type SimulateReplyRequest = z.input<typeof SimulateReplyRequest>;

/** LLM output for a draft. */
export const DraftOutput = z.object({ subject: z.string(), body: z.string() });
export type DraftOutput = z.infer<typeof DraftOutput>;
