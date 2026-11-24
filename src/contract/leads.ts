import { z } from "zod";
import { Activity, LedgerEntry } from "./activity";
import { Citation, Id, Timestamp } from "./common";
import { Message } from "./messages";

/**
 * Whose deadline is it?
 *   owner_bid_opening → the utility's bid opening. Lives on the Project. NEVER the supplier's cutoff.
 *   contractor_quote  → the bidding contractor's deadline for supplier/sub quotes. Lives on the Notice.
 *   supplier_form     → a specific form the contractor requires (e.g. "24 hours prior to bid").
 */
export const DeadlineKind = z.enum(["owner_bid_opening", "contractor_quote", "supplier_form"]);
export type DeadlineKind = z.infer<typeof DeadlineKind>;

export const Deadline = z.object({
  kind: DeadlineKind,
  belongsTo: z.enum(["owner", "contractor", "form"]),
  /** Resolved instant, or null when the source gives no usable date ("Deadline unknown"). */
  at: Timestamp.nullable(),
  /** The original instruction, verbatim. */
  rawText: z.string(),
  /** How `at` was computed, e.g. "Bid opening Dec 2, 2026 2:00 PM PT − 24 h". */
  derivation: z.string(),
  citation: Citation,
});
export type Deadline = z.infer<typeof Deadline>;

/**
 * Qualification (hard constraints run before scoring):
 *   actionable    → scope matches, supplier cutoff in the future, no disqualifying credential
 *   closed_window → the applicable supplier cutoff has passed (keep the account, suppress outreach)
 *   disqualified  → documented mandatory credential the supplier lacks, or outside target region
 *   needs_review  → missing deadline, ambiguous eligibility or conflicting current notices
 */
export const QualificationStatus = z.enum(["actionable", "closed_window", "disqualified", "needs_review"]);
export type QualificationStatus = z.infer<typeof QualificationStatus>;

export const Qualification = z.object({
  status: QualificationStatus,
  /** Dated UI label, e.g. "Open as of Nov 24" or "Deadline unknown". */
  label: z.string(),
  reasons: z.array(z.string()),
  /** The deadline that drove the decision. */
  decidingDeadline: Deadline.nullable(),
  /** Clock used for the decision (replay clock when set). */
  asOf: Timestamp,
});
export type Qualification = z.infer<typeof Qualification>;

/** 100-point fit score: 40 scope + 25 intent + 20 time + 15 contact. Separate from evidence strength. */
export const ScoreBreakdown = z.object({
  scope: z.int().min(0).max(40),
  intent: z.int().min(0).max(25),
  time: z.int().min(0).max(20),
  contact: z.int().min(0).max(15),
  total: z.int().min(0).max(100),
  /** Only actionable leads get a tier. */
  tier: z.enum(["A", "B", "C"]).nullable(),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;

export const EvidenceStrength = z.enum(["strong", "moderate", "weak"]);

export const ScopeMatch = z.object({
  /** Supplier capability. */
  service: z.string(),
  /** Contractor's requested scope, verbatim. */
  scope: z.string(),
  strength: z.enum(["named_equipment", "trade_level"]),
  citation: Citation,
});
export type ScopeMatch = z.infer<typeof ScopeMatch>;

/**
 * Contact verification:
 *   unchecked  → published in the source, not yet checked with a provider
 *   valid      → provider verified a deliverable mailbox (billable)
 *   accept_all → domain accepts everything; deliverability unknown
 *   unknown    → provider could not decide (common for role/shared mailboxes)
 *   invalid    → provider says undeliverable
 *   blocked    → check not run: insufficient credits
 */
export const VerificationStatus = z.enum(["unchecked", "valid", "accept_all", "unknown", "invalid", "blocked"]);

export const Contact = z.object({
  id: Id,
  /** A named coordinator and a shared mailbox are always separate contacts. */
  kind: z.enum(["person", "shared_mailbox"]),
  name: z.string().nullable(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  /** Where the contact was published. */
  published: Citation,
  verification: z.object({
    status: VerificationStatus,
    provider: z.string().nullable(),
    checkedAt: Timestamp.nullable(),
    score: z.number().nullable(),
    note: z.string(),
  }),
  /** Labeled research/test contact used to demo the billing path; never a real prospect. */
  isTestContact: z.boolean(),
});
export type Contact = z.infer<typeof Contact>;

export const Requirement = z.object({
  text: z.string(),
  mandatory: z.boolean(),
  credential: z.string().nullable(),
  /** Missing qualifications stay "unknown" rather than assumed. */
  supplierHas: z.enum(["yes", "no", "unknown"]),
});
export type Requirement = z.infer<typeof Requirement>;

/**
 * Pipeline stages, in order:
 *   matched → contacted (approved message accepted by provider) → replied (inbound reply matched)
 *   → meeting_booked → closed_won | closed_lost
 */
export const Stage = z.enum(["matched", "contacted", "replied", "meeting_booked", "closed_won", "closed_lost"]);
export type Stage = z.infer<typeof Stage>;

export const Milestone = z.enum(["quote_requested", "drawings_received", "quote_submitted"]);
export type Milestone = z.infer<typeof Milestone>;

export const Project = z.object({
  id: Id,
  ownerName: z.string(),
  title: z.string(),
  number: z.string().nullable(),
  location: z.string(),
  /** IANA zone used for relative-date math, e.g. America/Los_Angeles. */
  timezone: z.string(),
  bidOpening: Timestamp.nullable(),
  estimate: z.string().nullable(),
  citation: Citation,
});
export type Project = z.infer<typeof Project>;

export const LeadSummary = z.object({
  id: Id,
  projectId: Id,
  projectTitle: z.string(),
  projectNumber: z.string().nullable(),
  ownerName: z.string(),
  contractorName: z.string(),
  scopes: z.array(z.string()),
  qualification: Qualification,
  score: ScoreBreakdown,
  evidenceStrength: EvidenceStrength,
  stage: Stage,
  milestones: z.array(z.object({ key: Milestone, at: Timestamp })),
  nextAction: z.string(),
  segment: z.string(),
  companyTier: z.enum(["enterprise", "mid_market", "small"]),
  /** Miles from the supplier's service-area center to the project, when both are known. */
  distanceMiles: z.number().nullable().default(null),
  /** seed = curated source snapshot; live = found by a live search run. */
  origin: z.enum(["seed", "live"]),
  updatedAt: Timestamp,
});
export type LeadSummary = z.infer<typeof LeadSummary>;

export const GraphNode = z.object({
  id: z.string(),
  /** "Service" is the pre-rename label for Product; old rows are read as Product. */
  label: z.preprocess(
    (v) => (v === "Service" ? "Product" : v),
    z.enum(["Company", "Person", "Product", "Project", "Notice", "Scope", "Signal", "Competitor", "Deadline", "Message"]),
  ),
  name: z.string(),
  props: z.record(z.string(), z.unknown()),
});
export const GraphEdge = z.object({ from: z.string(), to: z.string(), rel: z.string() });
export const GraphView = z.object({ nodes: z.array(GraphNode), edges: z.array(GraphEdge) });
export type GraphView = z.infer<typeof GraphView>;

/** Firmographics for the contractor, from an enrichment provider (free; separate from contact verification). */
export const CompanyEnrichment = z.object({
  domain: z.string(),
  /** Provider resolved the domain to a real company record. */
  domainVerified: z.boolean(),
  legalName: z.string().nullable(),
  headquarters: z.string().nullable(),
  industry: z.string().nullable(),
  naics: z.string().nullable(),
  employees: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  provider: z.string(),
  checkedAt: Timestamp,
});
export type CompanyEnrichment = z.infer<typeof CompanyEnrichment>;

export const LeadDetail = LeadSummary.extend({
  project: Project,
  contractor: z.object({ id: Id, name: z.string(), domain: z.string().nullable() }),
  company: CompanyEnrichment.nullable().default(null),
  /** Warm intro paths: your team member previously employed where this contact's company is. */
  warmPaths: z.array(z.object({ teammate: z.string(), via: z.string(), path: z.array(z.string()) })).default([]),
  notice: z.object({
    id: Id,
    title: z.string(),
    version: z.int(),
    sourceUrl: z.url(),
    isCurrent: z.boolean(),
    excerpt: z.string(),
  }),
  scopeMatches: z.array(ScopeMatch),
  deadlines: z.array(Deadline),
  contacts: z.array(Contact),
  requirements: z.array(Requirement),
  responseMethod: z.string(),
  /** Service → Scope → Notice → Contractor → Person/Deadline traversal for this lead. */
  graphPath: GraphView,
  messages: z.array(Message),
  activity: z.array(Activity),
  billing: z.object({ spent: z.int(), entries: z.array(LedgerEntry) }),
});
export type LeadDetail = z.infer<typeof LeadDetail>;

export const ListLeadsQuery = z.object({
  status: QualificationStatus.optional(),
  stage: Stage.optional(),
  tier: z.enum(["A", "B", "C"]).optional(),
  segment: z.string().optional(),
});
export type ListLeadsQuery = z.input<typeof ListLeadsQuery>;

export const ListLeadsResponse = z.object({ asOf: Timestamp, leads: z.array(LeadSummary) });

export const EvaluateLeadRequest = z.object({
  idempotencyKey: Id,
  /** Replay clock. Omit for "now". */
  asOf: Timestamp.optional(),
});
export type EvaluateLeadRequest = z.input<typeof EvaluateLeadRequest>;

export const VerifyContactRequest = z.object({ idempotencyKey: Id });
export type VerifyContactRequest = z.input<typeof VerifyContactRequest>;

export const MoveLeadRequest = z.object({
  stage: Stage.optional(),
  milestone: Milestone.optional(),
  note: z.string().max(500).optional(),
});
export type MoveLeadRequest = z.input<typeof MoveLeadRequest>;

export const Pipeline = z.object({
  columns: z.array(z.object({ stage: Stage, leads: z.array(LeadSummary) })),
  activity: z.array(Activity),
});
export type Pipeline = z.infer<typeof Pipeline>;

export const Competitor = z.object({
  id: Id,
  name: z.string(),
  url: z.string(),
  category: z.enum(["direct", "indirect", "alternative"]),
  positioning: z.string(),
  pricing: z.string(),
  differentiators: z.array(z.string()),
  citation: Citation,
});
export type Competitor = z.infer<typeof Competitor>;
export const ListCompetitorsResponse = z.object({ competitors: z.array(Competitor) });

export const Analytics = z.object({
  asOf: Timestamp,
  stageCounts: z.array(z.object({ stage: Stage, count: z.int() })),
  /** Each rate shows its denominator: leads that reached `from`. */
  conversions: z.array(
    z.object({ from: Stage, to: Stage, numerator: z.int(), denominator: z.int(), rate: z.number().nullable() }),
  ),
  qualification: z.array(z.object({ status: QualificationStatus, count: z.int() })),
  actorSplit: z.array(z.object({ kind: z.enum(["rep", "agent", "system", "contact"]), count: z.int() })),
  bySegment: z.array(z.object({ key: z.string(), leads: z.int(), contacted: z.int(), replied: z.int() })),
  byTier: z.array(z.object({ key: z.string(), leads: z.int(), contacted: z.int(), replied: z.int() })),
  variants: z.array(
    z.object({ variant: z.enum(["A", "B"]), valueProp: z.string(), channel: z.string(), sent: z.int(), replied: z.int(), rate: z.number().nullable() }),
  ),
});
export type Analytics = z.infer<typeof Analytics>;

export const AnalyticsQuery = z.object({ segment: z.string().optional(), tier: z.enum(["A", "B", "C"]).optional() });

/**
 * An agent's recorded decision on a lead (Band room handoffs). Free. Guardrail: an agent can never make a lead
 * actionable — "exclude" is accepted only when the server's own qualification agrees the lead is not actionable.
 */
export const AgentNoteRequest = z.object({
  role: z.enum(["planner", "builder", "reviewer", "security"]),
  decision: z.enum(["keep", "exclude", "note"]),
  note: z.string().min(1).max(1000),
  bandRoomId: z.string().max(100).optional(),
});
export type AgentNoteRequest = z.input<typeof AgentNoteRequest>;

export const GeoSearchQuery = z.object({ q: z.string().min(2).max(120) });
export const GeoSearchResponse = z.object({
  results: z.array(z.object({ label: z.string(), lat: z.number(), lng: z.number() })),
});

export const RefreshRequest = z.object({ asOf: Timestamp.optional() });
export type RefreshRequest = z.input<typeof RefreshRequest>;
export const RefreshResponse = z.object({
  asOf: Timestamp,
  checked: z.int(),
  changed: z.array(z.object({ leadId: Id, contractorName: z.string(), from: QualificationStatus, to: QualificationStatus, reason: z.string() })),
  staleMessages: z.int(),
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;
