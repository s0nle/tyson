/**
 * Capability ↔ requested-scope matching. Both sides of the app use this, so the
 * match shown in the UI is the match the server stored.
 */

interface Concept {
  id: string;
  level: "equipment" | "trade";
  terms: string[];
}

export const CONCEPTS: Concept[] = [
  { id: "mcc", level: "equipment", terms: ["motor control center", "motor control centre", "mcc", "motor control"] },
  { id: "instrumentation", level: "trade", terms: ["instrumentation", "instruments", "i&c", "e&i", "controls", "scada", "sensor"] },
  { id: "electrical", level: "trade", terms: ["electrical"] },
  { id: "gates", level: "equipment", terms: ["slide gate", "sluice gate", "gates", "access hatch"] },
  { id: "bypass", level: "equipment", terms: ["bypass pumping", "bypass pump", "temporary pumping"] },
  { id: "pumps", level: "equipment", terms: ["pump station", "pumps", "pump "] },
  { id: "mixers", level: "equipment", terms: ["mixer", "aerator", "blower"] },
  { id: "valves", level: "equipment", terms: ["valve", "piping", "pipe"] },
  { id: "coatings", level: "trade", terms: ["coating", "painting", "lining"] },
  { id: "lead_abatement", level: "trade", terms: ["lead abatement", "abatement"] },
  { id: "concrete", level: "trade", terms: ["concrete", "rebar", "frp"] },
  { id: "metals", level: "trade", terms: ["metals", "grating", "handrail", "platform", "stairs"] },
  { id: "earthwork", level: "trade", terms: ["earthwork", "excavation", "trenching", "shoring"] },
  { id: "hauling", level: "trade", terms: ["trucking", "hauling", "demolition"] },
];

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9&]+/g, " ").replace(/\s+/g, " ")} `;

export function conceptsIn(text: string): Concept[] {
  const t = norm(text);
  return CONCEPTS.filter((c) => c.terms.some((term) => t.includes(norm(term).trimEnd()) || t.includes(` ${term.trim()}s `)));
}

export interface ScopeMatchResult {
  service: string;
  scope: string;
  strength: "named_equipment" | "trade_level";
}

/** Every (capability, scope) pair that shares a concept; equipment-level sharing beats trade-level. */
export function matchScopes(capabilities: string[], scopes: string[]): ScopeMatchResult[] {
  const out: ScopeMatchResult[] = [];
  for (const service of capabilities) {
    const sc = conceptsIn(service);
    if (sc.length === 0) continue;
    for (const scope of scopes) {
      const shared = conceptsIn(scope).filter((c) => sc.some((s) => s.id === c.id));
      if (shared.length === 0) continue;
      out.push({ service, scope, strength: shared.some((c) => c.level === "equipment") ? "named_equipment" : "trade_level" });
    }
  }
  return out;
}

export function bestStrength(matches: ScopeMatchResult[]): "named_equipment" | "trade_level" | "none" {
  if (matches.some((m) => m.strength === "named_equipment")) return "named_equipment";
  return matches.length > 0 ? "trade_level" : "none";
}
