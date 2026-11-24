import { z } from "zod";
import { cyrb53, LeadDetail, NoticeExtraction } from "@/contract";

/** Deterministic UUID (v4-shaped) from parts, so re-running discovery updates the same records. */
export function stableId(...parts: string[]): string {
  const s = parts.join("|");
  const h = (cyrb53(s, 1) + cyrb53(s, 2) + cyrb53(s, 3)).replace(/[^0-9a-f]/g, "0").padEnd(40, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const SourceRec = z.object({
  id: z.uuid(),
  key: z.string(),
  url: z.string(),
  title: z.string(),
  kind: z.enum(["owner_listing", "contractor_notice", "web_page"]),
  text: z.string(),
  retrievedAt: z.string(),
  stampedDate: z.string().nullable(),
  version: z.int(),
  origin: z.enum(["seed", "live"]),
});
export type SourceRec = z.infer<typeof SourceRec>;

export const NoticeRec = z.object({
  id: z.uuid(),
  sourceId: z.uuid(),
  version: z.int(),
  isCurrent: z.boolean(),
  origin: z.enum(["seed", "live"]),
  extraction: NoticeExtraction,
  /** false when the LLM's excerpt was not found verbatim in the page (claim downgraded). */
  excerptVerified: z.boolean(),
  projectId: z.uuid(),
  contractorId: z.uuid(),
});
export type NoticeRec = z.infer<typeof NoticeRec>;

export const LeadRec = LeadDetail.omit({ messages: true, activity: true, billing: true }).extend({ noticeId: z.uuid() });
export type LeadRec = z.infer<typeof LeadRec>;
