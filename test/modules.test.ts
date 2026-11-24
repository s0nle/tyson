import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approvalHash } from "../src/contract";
import { DEFAULT_DESCRIPTION } from "../src/server/seed";
import { startBackend } from "./harness";

const uuid = () => crypto.randomUUID();

describe("modules 3–5 additions", () => {
  let b: Awaited<ReturnType<typeof startBackend>>;
  let leadId: string;
  beforeAll(async () => {
    b = await startBackend();
    const rep = b.as("mod");
    await rep("inferProfile", { body: { companyName: "Bay Controls Co", description: DEFAULT_DESCRIPTION } });
    await rep("approveProfile");
    await rep("startRun", { body: { mode: "seed" } });
    const ww = (await rep("listLeads")).leads.find((l) => l.contractorName === "Western Water");
    if (!ww) throw new Error("no WW");
    leadId = ww.id;
  });
  afterAll(() => b.close());

  it("graph uses Product nodes and writes MATCHED_TO", async () => {
    const g = await b.as("mod")("getGraph");
    expect(g.nodes.some((n) => n.label === "Product")).toBe(true);
    expect(g.edges.filter((e) => e.rel === "MATCHED_TO")).toHaveLength(2);
  });

  it("company enrichment adds firmographics without spending credits", async () => {
    const rep = b.as("mod");
    const before = (await rep("getMe")).credits.available;
    const d = await rep("enrichCompany", { params: { leadId }, body: {} });
    expect(d.company?.domain).toBe("westernwater.com");
    expect(d.company?.domainVerified).toBe(true);
    expect(d.company?.headquarters).toMatch(/Santa Rosa/);
    expect((await rep("getMe")).credits.available).toBe(before);
  });

  it("drafts a 3-touch sequence with personas and value props, listed in the queue", async () => {
    const rep = b.as("mod");
    const { messages } = await rep("draftSequence", { params: { leadId }, body: { variant: "B" } });
    expect(messages.map((m) => [m.channel, m.sendAfterDays])).toEqual([
      ["email", 0],
      ["linkedin", 1],
      ["email", 3],
    ]);
    expect(messages.every((m) => m.valueProp.startsWith("Local track record"))).toBe(true);
    expect(messages[0]?.persona).toMatch(/Estimator/);
    expect(messages[2]?.body).toMatch(/Following up/);
    const q = await rep("getQueue");
    expect(q.items).toHaveLength(3);
    expect(q.items[0]?.lead.contractorName).toBe("Western Water");
  });

  it("send + reply write CONTACTED_VIA and REPLIED_TO edges", async () => {
    const rep = b.as("mod");
    const m = (await rep("getQueue")).items[0]?.message;
    if (!m) throw new Error("no message");
    await rep("decideMessage", { params: { messageId: m.id }, body: { decision: "approve", revision: m.revision, hash: approvalHash(m) } });
    await rep("sendMessage", { params: { messageId: m.id }, body: { idempotencyKey: uuid() } });
    await rep("simulateReply", { params: { messageId: m.id }, body: {} });
    const rels = (await rep("getGraph")).edges.map((e) => e.rel);
    expect(rels).toContain("CONTACTED_VIA");
    expect(rels).toContain("REPLIED_TO");
    const a = await rep("getAnalytics");
    expect(a.variants.find((v) => v.variant === "B" && v.channel === "email")).toMatchObject({ valueProp: "Local track record", sent: 1, replied: 1 });
  });

  it("refresh after the cutoff closes Western Water and stales its unsent drafts", async () => {
    const rep = b.as("mod");
    b.set("2026-12-01T14:30:00-08:00");
    const r = await rep("refreshLeads", { body: {} });
    expect(r.changed).toEqual([expect.objectContaining({ contractorName: "Western Water", from: "actionable", to: "closed_window" })]);
    expect(r.staleMessages).toBe(2);
    const q = await rep("getQueue");
    const stale = q.items[0]?.message;
    expect(stale?.staleReason).toMatch(/has passed/);
    if (!stale) throw new Error("no stale");
    await expect(
      rep("decideMessage", { params: { messageId: stale.id }, body: { decision: "approve", revision: stale.revision, hash: approvalHash(stale) } }),
    ).rejects.toThrow(/stale/);
    const detail = await rep("getLead", { params: { leadId } });
    expect(detail.activity.some((x) => x.type === "lead_requalified" && x.actor.kind === "system")).toBe(true);
  });
});

describe("profile change clears leads that no longer match", () => {
  it("a new business's run drops the old business's untouched leads", async () => {
    const b = await startBackend();
    const rep = b.as("switcher");
    await rep("inferProfile", { body: { description: DEFAULT_DESCRIPTION } });
    await rep("approveProfile");
    await rep("startRun", { body: { mode: "seed" } });
    expect((await rep("listLeads")).leads.length).toBe(2);
    await rep("inferProfile", { body: { companyName: "Golden Gate Traffic Services", description: "We provide flagging crews, temporary signs, and lane closures for contractors in San Francisco and Alameda County." } });
    await rep("approveProfile");
    await rep("startRun", { body: { mode: "seed" } });
    expect((await rep("listLeads")).leads).toHaveLength(0);
    await b.close();
  });
});

describe("service area (map center + radius)", () => {
  it("keeps projects inside the radius and rules out the rest with the distance", async () => {
    const b = await startBackend();
    const rep = b.as("radius");
    await rep("inferProfile", { body: { description: DEFAULT_DESCRIPTION } });
    await rep("approveProfile");
    const found = await rep("geoSearch", { query: { q: "Oakland" } });
    const oak = found.results[0];
    if (!oak) throw new Error("no geocode");
    await rep("updateProfile", { body: { serviceArea: { label: oak.label, lat: oak.lat, lng: oak.lng, radiusMiles: 25 } } });
    expect((await rep("getProfile")).profile?.status).toBe("approved");
    await rep("startRun", { body: { mode: "seed" } });
    const ww = (await rep("listLeads")).leads.find((l) => l.contractorName === "Western Water");
    expect(ww?.qualification.status).toBe("actionable");
    expect(ww?.distanceMiles).toBe(0);

    await rep("updateProfile", { body: { serviceArea: { label: "Fresno, CA", lat: 36.7378, lng: -119.7871, radiusMiles: 25 } } });
    const r = await rep("refreshLeads", { body: {} });
    expect(r.changed.some((c) => c.contractorName === "Western Water" && c.to === "disqualified")).toBe(true);
    const after = (await rep("listLeads")).leads.find((l) => l.contractorName === "Western Water");
    expect(after?.qualification.label).toBe("Outside service area");
    expect(after?.qualification.reasons[0]).toMatch(/Oakland, CA is 1\d\d mi from Fresno, CA \(your limit: 25 mi\)/);
    await b.close();
  });
});
