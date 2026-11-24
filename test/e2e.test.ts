import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approvalHash, ContractError } from "../src/contract";
import { DEFAULT_DESCRIPTION } from "../src/server/seed";
import { startBackend } from "./harness";

const uuid = () => crypto.randomUUID();

describe("Oakland SD-462 story (Nov 24 replay)", () => {
  let b: Awaited<ReturnType<typeof startBackend>>;
  beforeAll(async () => {
    b = await startBackend();
  });
  afterAll(() => b.close());

  it("runs intake → discovery → HITL → send → reply → credits", async () => {
    const rep = b.as("sam");
    const me = await rep("getMe");
    expect(me.credits.available).toBe(6);

    // intake + approval
    const draft = await rep("inferProfile", { body: { companyName: "Bay Controls Co", description: DEFAULT_DESCRIPTION } });
    expect(draft.status).toBe("draft");
    expect(draft.icp.find((f) => f.key === "buyer_roles")?.values).toContain("Estimator");
    await expect(rep("startRun", { body: { mode: "seed" } })).rejects.toThrow(/Approve/);
    const approved = await rep("approveProfile");
    expect(approved.status).toBe("approved");

    // discovery
    const run = await rep("startRun", { body: { mode: "seed" } });
    const done = await rep("getRun", { params: { runId: run.id } });
    expect(done.status).toBe("done");
    expect(done.steps.some((s) => s.actor.role === "reviewer" && /Garney Pacific: Published window closed/.test(s.message))).toBe(true);

    const { leads } = await rep("listLeads");
    const ww = leads.find((l) => l.contractorName === "Western Water");
    const garney = leads.find((l) => l.contractorName === "Garney Pacific");
    expect(ww?.qualification.status).toBe("actionable");
    expect(ww?.qualification.decidingDeadline?.at).toBe("2026-12-01T14:00:00-08:00");
    expect(ww?.projectNumber).toBe("SD-462");
    expect(ww?.score.tier).toBe("A");
    expect(garney?.qualification.status).toBe("closed_window");
    expect(garney?.qualification.decidingDeadline?.at).toBe("2026-11-17T14:00:00-08:00");
    if (!ww || !garney) throw new Error("leads missing");

    const detail = await rep("getLead", { params: { leadId: ww.id } });
    expect(detail.contacts.filter((c) => !c.isTestContact).map((c) => c.kind).sort()).toEqual(["person", "shared_mailbox"]);
    expect(detail.graphPath.edges.some((e) => e.rel === "MATCHES")).toBe(true);
    expect(detail.graphPath.nodes.some((n) => n.label === "Person" && n.name === "Luke Sherman")).toBe(true);

    // closed window suppresses outreach
    await expect(rep("draftMessage", { params: { leadId: garney.id }, body: {} })).rejects.toThrow(/suppressed/);

    // evaluate (1 credit, idempotent)
    const key = uuid();
    await rep("evaluateLead", { params: { leadId: ww.id }, body: { idempotencyKey: key } });
    await rep("evaluateLead", { params: { leadId: ww.id }, body: { idempotencyKey: key } });
    expect((await rep("getMe")).credits.available).toBe(5);

    // verify labeled test contact (3 credits)
    const test = detail.contacts.find((c) => c.isTestContact);
    if (!test) throw new Error("no test contact");
    const verified = await rep("verifyContact", { params: { leadId: ww.id, contactId: test.id }, body: { idempotencyKey: uuid() } });
    expect(verified.contacts.find((c) => c.id === test.id)?.verification.status).toBe("valid");
    expect((await rep("getMe")).credits.available).toBe(2);

    // HITL
    const m = await rep("draftMessage", { params: { leadId: ww.id }, body: {} });
    expect(m.status).toBe("draft");
    expect(m.body).toMatch(/drawings/);
    await expect(rep("sendMessage", { params: { messageId: m.id }, body: { idempotencyKey: uuid() } })).rejects.toMatchObject({ code: "approval_required" });
    const ok = await rep("decideMessage", { params: { messageId: m.id }, body: { decision: "approve", revision: 1, hash: approvalHash(m) } });
    expect(ok.status).toBe("approved");
    const edited = await rep("reviseMessage", { params: { messageId: m.id }, body: { subject: m.subject, body: `${m.body}\n`, recipient: m.recipient, channel: "email" } });
    expect(edited.status).toBe("draft");
    expect(edited.approval).toBeNull();
    await expect(rep("sendMessage", { params: { messageId: m.id }, body: { idempotencyKey: uuid() } })).rejects.toMatchObject({ code: "approval_required" });
    await rep("decideMessage", { params: { messageId: m.id }, body: { decision: "approve", revision: 2, hash: approvalHash(edited) } });
    const sent = await rep("sendMessage", { params: { messageId: m.id }, body: { idempotencyKey: uuid() } });
    await rep("sendMessage", { params: { messageId: m.id }, body: { idempotencyKey: uuid() } });
    expect(sent.status).toBe("sent");
    expect(b.mail.calls).toBe(1);
    expect((await rep("getMe")).credits.available).toBe(1);

    // reply advances only this lead; replay does not duplicate
    await rep("simulateReply", { params: { messageId: m.id }, body: {} });
    await rep("simulateReply", { params: { messageId: m.id }, body: {} });
    const after = await rep("getLead", { params: { leadId: ww.id } });
    expect(after.stage).toBe("replied");
    expect(after.activity.filter((a) => a.type === "reply_received")).toHaveLength(1);
    expect((await rep("getLead", { params: { leadId: garney.id } })).stage).toBe("matched");

    // credit gate: 1 left, 3-credit lookup blocked with zero provider calls
    const callsBefore = b.enrich.calls;
    const mailbox = detail.contacts.find((c) => c.kind === "shared_mailbox");
    if (!mailbox) throw new Error("no mailbox");
    const err = await rep("verifyContact", { params: { leadId: ww.id, contactId: mailbox.id }, body: { idempotencyKey: uuid() } }).catch((e) => e);
    expect(err).toBeInstanceOf(ContractError);
    expect((err as ContractError).code).toBe("insufficient_credits");
    expect(b.enrich.calls).toBe(callsBefore);

    const ledger = await rep("getLedger");
    expect(ledger.spent).toBe(5);
    expect(ledger.available).toBe(1);
    expect(ledger.entries.filter((e) => e.status === "settled" && e.credits < 0)).toHaveLength(3);

    const a = await rep("getAnalytics");
    expect(a.conversions[0]).toMatchObject({ from: "matched", to: "contacted", numerator: 1, denominator: 1 });
    expect(a.actorSplit.find((x) => x.kind === "agent")?.count).toBeGreaterThan(0);
  });

  it("after Dec 1 2:00 PM PT the replay closes Western Water", async () => {
    b.set("2026-12-01T15:00:00-08:00");
    const rep = b.as("late");
    await rep("inferProfile", { body: { description: DEFAULT_DESCRIPTION } });
    await rep("approveProfile");
    await rep("startRun", { body: { mode: "seed" } });
    const { leads } = await rep("listLeads");
    expect(leads.every((l) => l.qualification.status === "closed_window")).toBe(true);
  });

  it("a different supplier gets a different conclusion", async () => {
    b.set("2026-11-24T09:00:00-08:00");
    const rep = b.as("gates");
    await rep("inferProfile", { body: { description: "We supply and rehabilitate slide gates and sluice gates for California treatment plants." } });
    await rep("approveProfile");
    await rep("startRun", { body: { mode: "seed" } });
    const { leads } = await rep("listLeads");
    expect(leads.find((l) => l.contractorName === "Western Water")?.scopes.join(" ")).toMatch(/gates/);
    const hvac = b.as("hvac");
    await hvac("inferProfile", { body: { description: "We service rooftop HVAC units for office buildings." } });
    await hvac("approveProfile");
    await hvac("startRun", { body: { mode: "seed" } });
    expect((await hvac("listLeads")).leads).toHaveLength(0);
  });
});
