import { z } from "zod";

/** Every id is a UUID. */
export const Id = z.uuid();
/** ISO-8601 with offset. Compare as instants; display in the project's time zone. */
export const Timestamp = z.iso.datetime({ offset: true });
/** Integer credits. Spends are negative ledger amounts, grants positive. */
export const Credits = z.int();

/** Who did something. Agents are distinguished from reps on every activity row. */
export const AgentRole = z.enum(["planner", "builder", "reviewer", "security"]);
export type AgentRole = z.infer<typeof AgentRole>;

export const Actor = z.object({
  /** rep = human sales rep; agent = one of the four AI roles; system = scheduler/webhook; contact = the prospect. */
  kind: z.enum(["rep", "agent", "system", "contact"]),
  /** Display name, e.g. "sam" or "Reviewer agent". */
  name: z.string(),
  role: AgentRole.optional(),
});
export type Actor = z.infer<typeof Actor>;

/** A cited source fragment. Every contractor, scope, contact and timing claim carries one. */
export const Citation = z.object({
  sourceId: Id,
  url: z.url(),
  title: z.string(),
  /** Short verbatim excerpt supporting the claim. */
  excerpt: z.string(),
  /** When we fetched it. */
  retrievedAt: Timestamp,
  /** Date printed on the source, if any (differs from retrieval date). */
  stampedDate: z.string().nullable(),
  /** Notice version; a superseding notice increments it. */
  version: z.int().min(1),
});
export type Citation = z.infer<typeof Citation>;

export const UserSummary = z.object({ id: Id, name: z.string() });

export const Me = z.object({
  user: UserSummary,
  org: z.object({ id: Id, name: z.string() }),
  credits: z.object({ available: Credits, spent: Credits, granted: Credits }),
  /** Which providers are live vs deterministic fakes. Shown in the header so the demo is honest. */
  providers: z.record(z.string(), z.enum(["live", "fake"])),
});
export type Me = z.infer<typeof Me>;
