import type { IcpInference } from "@/contract";
import type { AiProvider, BillingProvider, EnrichProvider, MailProvider, SearchProvider } from "./types";

/** Deterministic stand-ins so the whole product runs with zero keys. */

function splitCapabilities(description: string): string[] {
  const d = description.toLowerCase();
  const caps: string[] = [];
  if (/motor control/.test(d)) caps.push("Motor control center (MCC) retrofits");
  if (/instrument/.test(d)) caps.push("Instrumentation installation");
  if (/slide gate|sluice/.test(d)) caps.push("Slide gate supply and rehabilitation");
  if (/bypass/.test(d)) caps.push("Temporary bypass pumping");
  if (/coating|painting/.test(d)) caps.push("Protective coatings");
  if (/valve/.test(d)) caps.push("Valve supply");
  if (/abatement/.test(d)) caps.push("Lead abatement");
  if (caps.length === 0) caps.push(description.split(/[.,;]/)[0]?.trim() || "General services");
  return caps;
}

export const fakeAi: AiProvider = {
  kind: "fake",
  async inferIcp({ companyName, description }): Promise<IcpInference> {
    const norcal = /northern california|norcal|bay area/i.test(description);
    return {
      companyName: companyName || "Demo Controls Supplier",
      capabilities: splitCapabilities(description),
      regions: norcal ? ["Northern California"] : [],
      certifications: [],
      quotePrepDays: 3,
      icp: [
        { key: "industries", label: "Target industries", values: ["Water & wastewater treatment construction"], confidence: 0.9, rationale: "Description names water plants", },
        { key: "naics", label: "NAICS alignment", values: ["237110 Water & Sewer Line Construction", "238210 Electrical Contractors", "221320 Sewage Treatment Facilities (owner)"], confidence: 0.72, rationale: "Buyers are civil/electrical contractors bidding utility plant work" },
        { key: "company_size", label: "Company size", values: ["General contractors bidding $5M–$50M public works"], confidence: 0.45, rationale: "Inferred from typical plant-upgrade contract sizes; not stated" },
        { key: "buyer_roles", label: "Buyer roles", values: ["Estimator", "Estimating coordinator", "Purchasing lead", "Project manager"], confidence: 0.85, rationale: "Contractors collect supplier quotes through estimating" },
        { key: "buying_signals", label: "Buying signals", values: ["Sub-bid / supplier quote requests naming MCC or I&C scope", "Utility bid openings for plant upgrades", "Addenda changing electrical scope"], confidence: 0.8, rationale: "A contractor notice is explicit buying intent" },
        { key: "regions", label: "Regions", values: norcal ? ["Northern California"] : [], confidence: norcal ? 0.95 : 0.2, rationale: norcal ? "Stated in description" : "Unknown — not stated" },
        { key: "exclusions", label: "Exclusions", values: ["Supplier window already closed", "Projects outside target region"], confidence: 0.7, rationale: "Hard qualification constraints" },
      ],
      adjacentSegments: [
        { name: "Pump-station contractors", rationale: "Pump stations use the same MCCs and level/flow instrumentation", evidence: "Current water-plant notices bundle bypass pumping and pump scopes with electrical work", confidence: 0.68 },
        { name: "Lift-station rehab for sanitation districts", rationale: "Smaller, frequent electrical retrofits for the same buyer roles", evidence: "Sanitation districts publish recurring lift-station rehab bids", confidence: 0.55 },
      ],
    };
  },
  async extractNotice({ title }) {
    return {
      isSupplierSolicitation: false, bidder: "", bidderDomain: null, projectTitle: title, projectNumber: null, owner: "", location: "",
      ownerBidOpening: null, estimate: null, scopes: [], scopeExcerpt: "", deadlines: [], contacts: [], requirements: [], responseMethod: "",
    };
  },
  async draft(ctx) {
    const who = ctx.recipientName ? `Hi ${ctx.recipientName.split(" ")[0]},` : "Hello estimating team,";
    const items = ctx.matchedScopes.slice(0, 2).join(" and ");
    if (ctx.channel === "linkedin") {
      return { subject: "LinkedIn note", body: `${who} we supply ${ctx.capabilities[0]?.toLowerCase()} for Northern California water plants and saw ${items} in ${ctx.contractorName}'s request for ${ctx.projectTitle}. Happy to quote if you can share the electrical drawings.` };
    }
    const body =
      ctx.variant === "A"
        ? `${who}\n\nWe retrofit motor control centers and install instrumentation at Northern California water plants. We saw ${items} in ${ctx.contractorName}'s request for the ${ctx.projectTitle} project.\n\nCould you share the electrical drawings and retrofit specifications so we can determine which items we can quote? We'll follow your published instructions (${ctx.responseMethod}) ahead of the ${ctx.cutoffText} cutoff.\n\nThanks,\n${ctx.supplierName}`
        : `${who}\n\n${ctx.supplierName} focuses on ${ctx.capabilities.join(", ").toLowerCase()}${ctx.pastWins ? ` (recent: ${ctx.pastWins})` : ""}. Your ${ctx.projectTitle} request lists ${items}.\n\nIf you send the applicable electrical drawings, we can confirm scope and turn a quote before the ${ctx.cutoffText} cutoff.\n\nBest,\n${ctx.supplierName}`;
    return { subject: `${ctx.projectTitle}: ${items} quote — drawings request`, body };
  },
  async summarizeCompetitors() {
    return [];
  },
};

export const fakeSearch: SearchProvider = { kind: "fake", async search() { return []; } };

export function makeFakeEnrich(): EnrichProvider {
  const p: EnrichProvider = {
    kind: "fake",
    calls: 0,
    async verifyEmail(email) {
      p.calls++;
      if (/^(bids|info|estimating|sales|quotes|admin)@/i.test(email)) {
        return { status: "unknown", score: null, note: "Role/shared mailbox: deliverability could not be confirmed (fake provider)" };
      }
      return { status: "valid", score: 92, note: "Deliverable mailbox, MX records present (fake provider)" };
    },
  };
  return p;
}

export function makeFakeMail(): MailProvider {
  const p: MailProvider = {
    kind: "fake",
    calls: 0,
    async send({ tag }) {
      p.calls++;
      return { providerMessageId: `sim_${tag}_${p.calls}` };
    },
  };
  return p;
}

export const fakeBilling: BillingProvider = {
  kind: "fake",
  customerExternalId: (orgId) => `org_${orgId}`,
  async ensureCustomer() {},
  async ingest() { return false; },
  async walletBalance() { return null; },
};
