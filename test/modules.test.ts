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
