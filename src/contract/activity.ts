import { z } from "zod";
import { Actor, Credits, Id, Timestamp } from "./common";

export const ActivityType = z.enum([
  "profile_inferred",
  "profile_updated",
  "profile_approved",
  "run_started",
  "run_finished",
  "source_retrieved",
  "notice_extracted",
  "graph_written",
  "lead_matched",
  "lead_excluded",
  "review_check",
  "security_check",
  "lead_evaluated",
  "contact_verified",
  "draft_created",
  "draft_revised",
  "message_approved",
  "message_rejected",
  "message_sent",
  "reply_received",
  "stage_changed",
  "milestone",
  "credits_blocked",
  "lead_requalified",
  "company_enriched",
]);
export type ActivityType = z.infer<typeof ActivityType>;

/** Audit row for everything consequential. Agent vs rep attribution comes from `actor.kind`. */
export const Activity = z.object({
  id: Id,
  at: Timestamp,
  leadId: Id.nullable(),
  runId: Id.nullable(),
  actor: Actor,
  type: ActivityType,
  summary: z.string(),
  channel: z.enum(["email", "linkedin"]).nullable(),
  variant: z.enum(["A", "B"]).nullable(),
  /** Ledger / Flexprice event id when this action was billed. */
  billingEventId: z.string().nullable(),
});
export type Activity = z.infer<typeof Activity>;

export const BillableOperation = z.enum(["graph_query_evaluated", "lead_enriched", "outreach_sent"]);
export type BillableOperation = z.infer<typeof BillableOperation>;

/**
 * Ledger entry lifecycle:
 *   pending → credits reserved before the provider call (balance already reduced)
 *   settled → provider call succeeded; usage event sent (or queued) to Flexprice with the same id
 *   failed  → provider call failed or result not billable; reservation released (credits = 0)
 */
export const LedgerEntry = z.object({
  /** Stable event id, also used as the Flexprice event_id. */
  id: z.string(),
  at: Timestamp,
  operation: z.enum(["grant", "graph_query_evaluated", "lead_enriched", "outreach_sent"]),
  /** Negative = spend, positive = grant. */
  credits: Credits,
  leadId: Id.nullable(),
  runId: Id.nullable(),
  status: z.enum(["pending", "settled", "failed"]),
  flexprice: z.enum(["synced", "pending", "disabled", "failed"]),
  note: z.string(),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

export const LedgerResponse = z.object({
  available: Credits,
  spent: Credits,
  granted: Credits,
  entries: z.array(LedgerEntry),
  flexprice: z.object({
    mode: z.enum(["live", "fake"]),
    customerExternalId: z.string(),
    /** Real-time wallet balance reported by Flexprice when live. */
    walletBalance: z.number().nullable(),
  }),
});
export type LedgerResponse = z.infer<typeof LedgerResponse>;
