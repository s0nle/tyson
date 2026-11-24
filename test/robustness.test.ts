import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DESCRIPTION } from "../src/server/seed";
import { fakeAi } from "../src/server/providers/fakes";
import type { SearchProvider } from "../src/server/providers/types";
import { startBackend } from "./harness";

/** A live page whose LLM extraction contains unusable dates must not kill the run. */
describe("live discovery with malformed dates", () => {
  let b: Awaited<ReturnType<typeof startBackend>>;
  beforeAll(async () => {
    const search: SearchProvider = {
      kind: "live",
      async search() {
        return [{ url: "https://example.org/sub-bid", title: "Sub bid request — Acme Builders", content: "Acme Builders seeking quotes for motor control centers. Quotes due TBD." }];
      },
    };
    b = await startBackend({
      search,
      ai: {
        ...fakeAi,
        async extractNotice() {
          return {
            isSupplierSolicitation: true,
            bidder: "Acme Builders",
            bidderDomain: null,
            projectTitle: "Pump Station 7 Upgrade",
            projectNumber: null,
            owner: "Some Water District",
            location: "Sacramento, CA",
            ownerBidOpening: "TBD",
            estimate: null,
            scopes: ["motor control centers"],
            scopeExcerpt: "motor control centers",
            deadlines: [{ kind: "contractor_quote", rule: "absolute", at: "Dec 2nd 2PM", hoursBeforeBid: null, rawText: "Quotes due TBD" }],
            contacts: [],
            requirements: [],
            responseMethod: "Email quotes",
          };
        },
      },
    });
  });
  afterAll(() => b.close());

  it("finishes the run and sends the bad-date notice to review", async () => {
    const rep = b.as("robust");
    // The fake geocoder has no Stockton entry. Discovery still uses the city supplied at intake.
    const profile = await rep("inferProfile", { body: { description: DEFAULT_DESCRIPTION, companyLocation: "Stockton, CA" } });
    expect(profile.serviceArea).toBeNull();
    await rep("approveProfile");
    const run = await rep("startRun", { body: { mode: "live" } });
    const done = await rep("getRun", { params: { runId: run.id } });
    expect(done.error).toBeNull();
    expect(done.status).toBe("done");
    expect(done.steps.some((step) => step.kind === "search" && step.message.includes("Stockton, CA"))).toBe(true);
    const acme = (await rep("listLeads")).leads.find((l) => l.contractorName === "Acme Builders");
    expect(acme?.qualification.status).toBe("needs_review");
    expect(acme?.qualification.label).toBe("Deadline unknown");
  });
});
