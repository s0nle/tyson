import { z } from "zod";
import { Id, Timestamp } from "./common";

/**
 * Lifecycle of every inferred field and suggested segment:
 *   proposed  → the engine inferred it; not yet used for matching unless the profile is approved as-is
 *   accepted  → rep kept it unchanged
 *   edited    → rep changed the values (confidence becomes 1.0, source "rep")
 *   dismissed → excluded from matching
 */
export const DecisionStatus = z.enum(["proposed", "accepted", "edited", "dismissed"]);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

export const IcpFieldKey = z.enum([
  "industries",
  "naics",
  "company_size",
  "buyer_roles",
  "buying_signals",
  "regions",
  "exclusions",
]);
export type IcpFieldKey = z.infer<typeof IcpFieldKey>;

export const IcpField = z.object({
  key: IcpFieldKey,
  label: z.string(),
  values: z.array(z.string()),
  /** 0.00–1.00 inference certainty. "Unknown" fields keep values [] and a low confidence. */
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  status: DecisionStatus,
});
export type IcpField = z.infer<typeof IcpField>;

export const AdjacentSegment = z.object({
  id: Id,
  name: z.string(),
  rationale: z.string(),
  /** Evidence the rep reviews before approving, e.g. scopes seen in current notices. */
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
  status: DecisionStatus,
});
export type AdjacentSegment = z.infer<typeof AdjacentSegment>;

/**
 * Profile status:
 *   draft    → being edited; discovery uses it only after approval
 *   approved → frozen version used by discovery runs; any edit bumps `version` and returns to draft
 */
/** Where the supplier works: a center point and a radius (miles). Leads outside it are not pursued. */
export const ServiceArea = z.object({
  label: z.string().min(1).max(160),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusMiles: z.int().min(1).max(500),
});
export type ServiceArea = z.infer<typeof ServiceArea>;

export const SupplierProfile = z.object({
  id: Id,
  orgId: Id,
  companyName: z.string(),
  companyLocation: z.string().max(120).default(""),
  /** The supplier's own plain-language description. */
  description: z.string(),
  /** Approved services the supplier can quote; drives scope matching. */
  capabilities: z.array(z.string()),
  regions: z.array(z.string()),
  certifications: z.array(z.string()),
  pastWins: z.string(),
  typicalQuoteSize: z.string(),
  /** Calendar days the supplier needs to prepare a quote; drives the time score. */
  quotePrepDays: z.int().min(1).max(60),
  icp: z.array(IcpField),
  adjacentSegments: z.array(AdjacentSegment),
  serviceArea: ServiceArea.nullable().default(null),
  status: z.enum(["draft", "approved"]),
  approvedAt: Timestamp.nullable(),
  version: z.int().min(1),
  updatedAt: Timestamp,
});
export type SupplierProfile = z.infer<typeof SupplierProfile>;

export const ProfileResponse = z.object({ profile: SupplierProfile.nullable() });

export const InferProfileRequest = z.object({
  companyName: z.string().max(120).default(""),
  companyLocation: z.string().trim().min(2).max(120).optional(),
  description: z.string().min(10, "Describe what you sell in at least a sentence").max(4000),
});
export type InferProfileRequest = z.input<typeof InferProfileRequest>;

export const UpdateProfileRequest = z.object({
  companyName: z.string().max(120).optional(),
  capabilities: z.array(z.string().min(1)).optional(),
  regions: z.array(z.string().min(1)).optional(),
  certifications: z.array(z.string().min(1)).optional(),
  pastWins: z.string().optional(),
  typicalQuoteSize: z.string().optional(),
  quotePrepDays: z.int().min(1).max(60).optional(),
  /** Field decisions; values only matter for status "edited". */
  icp: z
    .array(z.object({ key: IcpFieldKey, status: DecisionStatus, values: z.array(z.string()).optional() }))
    .optional(),
  segments: z.array(z.object({ id: Id, status: DecisionStatus })).optional(),
  /** Map center + radius. Changing it does not require re-approval. null clears it. */
  serviceArea: ServiceArea.nullable().optional(),
});
export type UpdateProfileRequest = z.input<typeof UpdateProfileRequest>;

/** What the LLM must return for ICP inference (fed as structured output, then re-validated). */
export const IcpInference = z.object({
  companyName: z.string(),
  capabilities: z.array(z.string()),
  regions: z.array(z.string()),
  certifications: z.array(z.string()),
  quotePrepDays: z.int().min(1).max(60),
  icp: z.array(
    z.object({
      key: IcpFieldKey,
      label: z.string(),
      values: z.array(z.string()),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
    }),
  ),
  adjacentSegments: z.array(
    z.object({
      name: z.string(),
      rationale: z.string(),
      evidence: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type IcpInference = z.infer<typeof IcpInference>;
