import { z } from "zod";
import { Actor, Id, Timestamp } from "./common";

/**
 * Discovery run lifecycle: queued → running → done | failed.
 * The web request returns the run immediately; steps stream in as the "Agent Thinking" feed.
 */
export const RunStep = z.object({
  at: Timestamp,
  actor: Actor,
  kind: z.enum(["plan", "search", "retrieve", "extract", "graph", "match", "review", "security", "done", "error"]),
  message: z.string(),
  /** Optional link to the source being processed. */
  url: z.string().nullable(),
});
export type RunStep = z.infer<typeof RunStep>;

export const Run = z.object({
  id: Id,
  status: z.enum(["queued", "running", "done", "failed"]),
  /** seed = curated Oakland snapshots only; live = snapshots + live web search. */
  mode: z.enum(["seed", "live"]),
  asOf: Timestamp,
  profileVersion: z.int(),
  startedAt: Timestamp,
  finishedAt: Timestamp.nullable(),
  steps: z.array(RunStep),
  leadIds: z.array(Id),
  counts: z.object({
    sources: z.int(),
    candidates: z.int(),
    actionable: z.int(),
    closed: z.int(),
    review: z.int(),
    disqualified: z.int(),
  }),
  error: z.string().nullable(),
});
export type Run = z.infer<typeof Run>;

export const StartRunRequest = z.object({
  mode: z.enum(["seed", "live"]).default("live"),
  /** Replay clock, e.g. "2026-11-24T09:00:00-08:00". Omit for now. */
  asOf: Timestamp.optional(),
});
export type StartRunRequest = z.input<typeof StartRunRequest>;

export const ListRunsResponse = z.object({ runs: z.array(Run) });

/** LLM output when extracting a contractor's supplier solicitation from a page. */
export const NoticeExtraction = z.object({
  isSupplierSolicitation: z.boolean(),
  bidder: z.string(),
  bidderDomain: z.string().nullable(),
  projectTitle: z.string(),
  projectNumber: z.string().nullable(),
  owner: z.string(),
  location: z.string(),
  /** ISO-8601 with offset, or null if not stated. */
  ownerBidOpening: z.string().nullable(),
  estimate: z.string().nullable(),
  scopes: z.array(z.string()),
  scopeExcerpt: z.string(),
  deadlines: z.array(
    z.object({
      kind: z.enum(["contractor_quote", "supplier_form"]),
      /** absolute = a stated date; hours_before_bid = relative to the owner's bid opening. */
      rule: z.enum(["absolute", "hours_before_bid", "unknown"]),
      at: z.string().nullable(),
      hoursBeforeBid: z.number().nullable(),
      rawText: z.string(),
    }),
  ),
  contacts: z.array(
    z.object({
      kind: z.enum(["person", "shared_mailbox"]),
      name: z.string().nullable(),
      title: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    }),
  ),
  requirements: z.array(z.object({ text: z.string(), mandatory: z.boolean(), credential: z.string().nullable() })),
  responseMethod: z.string(),
});
export type NoticeExtraction = z.infer<typeof NoticeExtraction>;
