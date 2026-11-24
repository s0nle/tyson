import { describe, expect, it } from "vitest";
import {
  approvalHash,
  type Deadline,
  matchScopes,
  qualify,
  resolveDeadline,
  score,
} from "../src/contract";

const cite = {
  sourceId: "00000000-0000-4000-8000-000000000001",
  url: "https://example.com/n",
  title: "n",
  excerpt: "x",
  retrievedAt: "2026-11-24T09:00:00-08:00",
  stampedDate: null,
  version: 1,
};
const BID = "2026-12-02T14:00:00-08:00";

function dl(kind: Deadline["kind"], at: string | null): Deadline {
  return { kind, belongsTo: kind === "owner_bid_opening" ? "owner" : "contractor", at, rawText: "", derivation: "", citation: cite };
}

describe("deadlines", () => {
  it("derives Western Water's form cutoff as Dec 1 2:00 PM PT", () => {
    const r = resolveDeadline({ kind: "hours_before_bid", hours: 24 }, BID);
    expect(r.at).toBe("2026-12-01T14:00:00-08:00");
    expect(r.derivation).toContain("− 24 h");
  });

  it("Nov 24 replay: Western Water open, Garney closed", () => {
    const asOf = "2026-11-24T09:00:00-08:00";
    const ww = qualify({
      asOf,
      deadlines: [dl("owner_bid_opening", BID), dl("supplier_form", "2026-12-01T14:00:00-08:00")],
      requirements: [],
      regionMatch: true,
      conflictingCurrentNotices: false,
    });
    const garney = qualify({
      asOf,
      deadlines: [dl("owner_bid_opening", BID), dl("contractor_quote", "2026-11-17T14:00:00-08:00")],
      requirements: [],
      regionMatch: true,
      conflictingCurrentNotices: false,
    });
    expect(ww.status).toBe("actionable");
    expect(ww.label).toBe("Open as of Nov 24");
    expect(garney.status).toBe("closed_window");
    expect(garney.decidingDeadline?.at).toBe("2026-11-17T14:00:00-08:00");
  });

  it("after Dec 1 2:00 PM PT Western Water is closed too", () => {
    const q = qualify({
      asOf: "2026-12-01T14:00:01-08:00",
      deadlines: [dl("owner_bid_opening", BID), dl("supplier_form", "2026-12-01T14:00:00-08:00")],
      requirements: [],
      regionMatch: true,
      conflictingCurrentNotices: false,
    });
    expect(q.status).toBe("closed_window");
  });

  it("owner bid date alone never makes a lead actionable", () => {
    const q = qualify({
      asOf: "2026-11-24T09:00:00-08:00",
      deadlines: [dl("owner_bid_opening", BID)],
      requirements: [],
      regionMatch: true,
      conflictingCurrentNotices: false,
    });
    expect(q.status).toBe("needs_review");
    expect(q.label).toBe("Deadline unknown");
  });

  it("missing mandatory credential disqualifies", () => {
    const q = qualify({
      asOf: "2026-11-24T09:00:00-08:00",
      deadlines: [dl("supplier_form", "2026-12-01T14:00:00-08:00")],
      requirements: [{ text: "union labor", mandatory: true, credential: "Union labor", supplierHas: "no" }],
      regionMatch: true,
      conflictingCurrentNotices: false,
    });
    expect(q.status).toBe("disqualified");
  });
});

describe("matching + scoring", () => {
  const caps = ["Motor control center retrofits", "Instrumentation installation"];
  it("matches MCC at equipment level and instrumentation at trade level", () => {
    const m = matchScopes(caps, ["motor control centers (supply and retrofit)", "electrical, instrumentation and controls", "lead abatement"]);
    expect(m.find((x) => x.scope.startsWith("motor"))?.strength).toBe("named_equipment");
    expect(m.find((x) => x.scope.startsWith("electrical"))?.strength).toBe("trade_level");
    expect(m.some((x) => x.scope === "lead abatement")).toBe(false);
  });
  it("changing capabilities changes the match", () => {
    expect(matchScopes(["HVAC service"], ["motor control centers (supply and retrofit)"])).toHaveLength(0);
    expect(matchScopes(["Slide gate supply"], ["sluice gates and slide gates (supply and rehabilitation)"])).toHaveLength(1);
  });
  it("scores Western Water as tier A and closed leads get no tier", () => {
    const s = score({ status: "actionable", scopeStrength: "named_equipment", matchedScopes: 2, explicitIntent: true, hoursRemaining: 170, prepDays: 3, contactLevel: "person" });
    expect(s.total).toBeGreaterThanOrEqual(75);
    expect(s.tier).toBe("A");
    expect(score({ status: "closed_window", scopeStrength: "named_equipment", matchedScopes: 2, explicitIntent: true, hoursRemaining: -10, prepDays: 3, contactLevel: "person" }).tier).toBeNull();
  });
});

describe("approval hash", () => {
  it("changes when any bound field changes", () => {
    const base = { revision: 1, channel: "email", recipient: "a@b.co", subject: "s", body: "b" };
    const h = approvalHash(base);
    expect(approvalHash({ ...base })).toBe(h);
    expect(approvalHash({ ...base, body: "b!" })).not.toBe(h);
    expect(approvalHash({ ...base, recipient: "c@b.co" })).not.toBe(h);
    expect(approvalHash({ ...base, revision: 2 })).not.toBe(h);
  });
});

describe("matching beyond water plants", () => {
  it("traffic control supplier matches flagging / construction area signs scopes", () => {
    const caps = ["Flagging crews", "Temporary signs and lane closures"];
    const m = matchScopes(caps, ["Construction Area Signs", "Traffic Control", "Cold Plane", "Asphalt Paving"]);
    expect([...new Set(m.map((x) => x.scope))].sort()).toEqual(["Construction Area Signs", "Traffic Control"]);
  });
  it("concrete cutting supplier matches saw cutting / coring but not concrete materials", () => {
    const caps = ["Concrete cutting and coring"];
    const m = matchScopes(caps, ["Saw Cutting", "Core Drilling", "Concrete Materials", "Rebar"]);
    expect(m.map((x) => x.scope).sort()).toEqual(["Core Drilling", "Saw Cutting"]);
  });
  it("falls back to shared keywords for services outside the concept list", () => {
    expect(matchScopes(["Asbestos survey services"], ["Hazardous materials asbestos survey"])).toHaveLength(1);
    expect(matchScopes(["Landscape irrigation"], ["Traffic Control"])).toHaveLength(0);
  });
});
