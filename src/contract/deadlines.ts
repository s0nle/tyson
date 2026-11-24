import type { Deadline, Qualification, Requirement } from "./leads";
import { DEFAULT_TZ, formatInZone, shortDate, toZonedIso } from "./time";

export type DeadlineRule =
  | { kind: "absolute"; at: string }
  | { kind: "hours_before_bid"; hours: number }
  | { kind: "unknown" };

/**
 * Resolve a contractor/form deadline rule into an instant plus a human-readable derivation.
 * "24 hours prior to bid" is a duration, so it is computed on instants and rendered in the project zone.
 */
/** True when `s` parses to a real instant (LLM output like "TBD" or "Dec 2nd 2PM" does not). */
export function isInstant(s: string | null | undefined): s is string {
  return typeof s === "string" && s.length >= 10 && Number.isFinite(Date.parse(s));
}

export function resolveDeadline(
  rule: DeadlineRule,
  bidOpening: string | null,
  tz = DEFAULT_TZ,
): { at: string | null; derivation: string } {
  if (rule.kind === "absolute") {
    if (!isInstant(rule.at)) return { at: null, derivation: `Stated date "${rule.at}" is not a usable date` };
    return { at: toZonedIso(rule.at, tz), derivation: `Stated in notice: ${formatInZone(rule.at, tz)}` };
  }
  if (rule.kind === "hours_before_bid") {
    if (!bidOpening || !isInstant(bidOpening)) return { at: null, derivation: `${rule.hours} h before bid, but bid opening is unknown` };
    const at = new Date(new Date(bidOpening).getTime() - rule.hours * 3_600_000);
    return {
      at: toZonedIso(at, tz),
      derivation: `Bid opening ${formatInZone(bidOpening, tz)} − ${rule.hours} h = ${formatInZone(at, tz)}`,
    };
  }
  return { at: null, derivation: "No supplier deadline published" };
}

export interface QualifyInput {
  asOf: string;
  deadlines: Deadline[];
  requirements: Requirement[];
  /** false = outside the supplier's target regions; null = unknown. */
  regionMatch: boolean | null;
  conflictingCurrentNotices: boolean;
  tz?: string;
}

/** The supplier-applicable deadline is the earliest contractor/form deadline — never the owner's bid date. */
export function decidingDeadline(deadlines: Deadline[]): Deadline | null {
  const supplier = deadlines.filter((d) => d.kind !== "owner_bid_opening" && d.at);
  supplier.sort((a, b) => new Date(a.at as string).getTime() - new Date(b.at as string).getTime());
  return supplier[0] ?? null;
}

/** Hard constraints first: closed window, missing credential, region; then review triggers. */
export function qualify(input: QualifyInput): Qualification {
  const tz = input.tz ?? DEFAULT_TZ;
  const asOf = toZonedIso(input.asOf, tz);
  const reasons: string[] = [];
  const deciding = decidingDeadline(input.deadlines);

  const lacking = input.requirements.filter((r) => r.mandatory && r.supplierHas === "no");
  if (lacking.length > 0) {
    return {
      status: "disqualified",
      label: "Not eligible",
      reasons: lacking.map((r) => `Missing mandatory credential: ${r.credential ?? r.text}`),
      decidingDeadline: deciding,
      asOf,
    };
  }
  if (input.regionMatch === false) {
    return { status: "disqualified", label: "Outside region", reasons: ["Project is outside target regions"], decidingDeadline: deciding, asOf };
  }

  if (deciding && new Date(deciding.at as string).getTime() <= new Date(input.asOf).getTime()) {
    return {
      status: "closed_window",
      label: "Published window closed",
      reasons: [
        `${deciding.kind === "supplier_form" ? "Supplier form" : "Supplier quote"} deadline ${formatInZone(deciding.at as string, tz)} has passed (as of ${formatInZone(input.asOf, tz)})`,
        "Keep the account for future projects; outreach on this request is suppressed",
      ],
      decidingDeadline: deciding,
      asOf,
    };
  }

  if (!deciding) {
    const unresolved = input.deadlines.some((d) => d.kind !== "owner_bid_opening");
    return {
      status: "needs_review",
      label: "Deadline unknown",
      reasons: [
        unresolved
          ? "Contractor deadline could not be resolved to a date"
          : "Only the owner's bid opening is published; the contractor's supplier cutoff is unknown",
      ],
      decidingDeadline: null,
      asOf,
    };
  }

  if (input.conflictingCurrentNotices) {
    return { status: "needs_review", label: "Conflicting notices", reasons: ["Two current notices disagree"], decidingDeadline: deciding, asOf };
  }

  for (const r of input.requirements) {
    if (r.mandatory && r.supplierHas === "unknown") reasons.push(`Confirm eligibility: ${r.credential ?? r.text}`);
  }
  reasons.unshift(`Supplier cutoff ${formatInZone(deciding.at as string, tz)} (${deciding.derivation})`);
  return { status: "actionable", label: `Open as of ${shortDate(input.asOf, tz)}`, reasons, decidingDeadline: deciding, asOf };
}
