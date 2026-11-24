import type { QualificationStatus, ScoreBreakdown } from "./leads";

export const TIER_THRESHOLDS = { A: 75, B: 55 } as const;

export type ContactLevel = "person_verified" | "person" | "mailbox_verified" | "mailbox" | "none";

export interface ScoreInput {
  status: QualificationStatus;
  /** Best match strength across matched scopes. */
  scopeStrength: "named_equipment" | "trade_level" | "none";
  matchedScopes: number;
  /** The notice explicitly asks suppliers/subs for quotes. */
  explicitIntent: boolean;
  /** Hours until the deciding supplier cutoff (null = unknown). */
  hoursRemaining: number | null;
  prepDays: number;
  contactLevel: ContactLevel;
}

/** 40 scope + 25 intent + 20 time-vs-prep + 15 contact. Tier only for actionable leads. */
export function score(input: ScoreInput): ScoreBreakdown {
  const scopeBase = input.scopeStrength === "named_equipment" ? 34 : input.scopeStrength === "trade_level" ? 24 : 0;
  const scope = Math.min(40, scopeBase + (input.scopeStrength === "none" ? 0 : Math.min(2, input.matchedScopes - 1) * 3));
  const intent = input.explicitIntent ? 25 : 10;
  let time = 0;
  if (input.hoursRemaining !== null && input.hoursRemaining > 0) {
    const ratio = input.hoursRemaining / (input.prepDays * 24);
    time = ratio >= 2 ? 20 : ratio >= 1 ? 14 : ratio >= 0.5 ? 8 : 3;
  }
  const contact = { person_verified: 15, person: 11, mailbox_verified: 10, mailbox: 7, none: 0 }[input.contactLevel];
  const total = scope + intent + time + contact;
  const tier =
    input.status !== "actionable" ? null : total >= TIER_THRESHOLDS.A ? "A" : total >= TIER_THRESHOLDS.B ? "B" : "C";
  return { scope, intent, time, contact, total, tier };
}

/** Evidence strength is independent of fit: a perfect fit can rest on weak evidence. */
export function evidenceStrength(input: {
  origin: "seed" | "live";
  citedClaims: number;
  uncitedClaims: number;
  verifiedContact: boolean;
}): "strong" | "moderate" | "weak" {
  if (input.uncitedClaims > 0) return "weak";
  if (input.origin === "seed" && input.citedClaims >= 3) return "strong";
  if (input.verifiedContact && input.citedClaims >= 3) return "strong";
  return input.citedClaims >= 2 ? "moderate" : "weak";
}
