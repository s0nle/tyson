import type { NoticeExtraction } from "@/contract";

/**
 * Curated source snapshots for the Oakland demo. Every excerpt is copied verbatim from the public page
 * at `url` (retrieved 2026-11-24). Extractions are stored pre-computed so the demo is reproducible;
 * live runs add LLM-extracted notices from web search on top.
 */
export interface SeedSource {
  key: string;
  url: string;
  title: string;
  kind: "owner_listing" | "contractor_notice";
  retrievedAt: string;
  stampedDate: string | null;
  text: string;
  extraction: NoticeExtraction | null;
}

const RETRIEVED = "2026-11-24T11:10:00-08:00";

export const OWNER_SOURCE: SeedSource = {
  key: "ebmud-sd462",
  url: "https://ceqanet.lci.ca.gov/2026050646",
  title: "SD-462 MWWTP Secondary Reactors Rehabilitation Phase 2 (CEQA notice)",
  kind: "owner_listing",
  retrievedAt: RETRIEVED,
  stampedDate: null,
  text:
    "SD-462 MWWTP Secondary Reactors Rehabilitation Phase 2. This project will rehabilitate aging concrete infrastructure, piping, and electrical equipment; make modifications to support biological nutrient removal testing and process monitoring - particularly at Reactors 5 and 6.",
  extraction: null,
};

export const WESTERN_WATER: SeedSource = {
  key: "western-water-sd462",
  url: "https://www.sbeinc.com/mobile/advertising/cms.cfm?classifiedID=67931&fuseaction=classified.detail&pageID=52",
  title: "Sub Bid Request — Western Water — Main WWTP Secondary Reactors Rehabilitation, Phase 2",
  kind: "contractor_notice",
  retrievedAt: RETRIEVED,
  stampedDate: null,
  text: [
    "WESTERN WATER (WW), is seeking quotes from qualified subcontractors and suppliers, including but not limited to certified Disadvantaged Business Enterprise (DBE) firms",
    "Main Wastewater Treatment Plant Secondary Reactors Rehabilitation, Phase 2. Owner: East Bay Municipal Utility District. Project Location: Oakland, CA. Engineer's estimate: $18,500,000 - $19,500,000. Bid date: December 2, 2026 at 2:00 P.M.",
    "Scopes: electrical, instrumentation and controls; motor control centers (supply and retrofit); sluice gates and slide gates (supply and rehabilitation); mechanical equipment repair and supply (mixers, aerators); valves and piping appurtenances (supply); temporary bypass pumping; miscellaneous metals (platforms, stairs, handrail, grating); earthwork / excavation, trenching, and shoring; surveying, demolition and hauling; protective coatings and linings.",
    "Interested subs and suppliers should complete and submit the attached solicitation form no later than 24 hours prior to bid.",
    "Subcontractors must comply with subcontract insurance requirements, including a waiver of subrogation endorsement to their worker's compensation insurance.",
    "Luke Sherman, Estimating Coordinator, Western Water, 707 Aviation Blvd, Santa Rosa, CA. bids@westernwater.com. Phone: (707) 540-9640. Fax: (707) 540-9641. WW is an AA/EEO/Veterans/Disabled Employer – CA License No. 188068",
  ].join("\n"),
  extraction: {
    isSupplierSolicitation: true,
    bidder: "Western Water",
    bidderDomain: "westernwater.com",
    projectTitle: "Main Wastewater Treatment Plant Secondary Reactors Rehabilitation, Phase 2",
    projectNumber: null,
    owner: "East Bay Municipal Utility District",
    location: "Oakland, CA",
    ownerBidOpening: "2026-12-02T14:00:00-08:00",
    estimate: "$18,500,000 - $19,500,000",
    scopes: [
      "electrical, instrumentation and controls",
      "motor control centers (supply and retrofit)",
      "sluice gates and slide gates (supply and rehabilitation)",
      "mechanical equipment repair and supply (mixers, aerators)",
      "valves and piping appurtenances (supply)",
      "temporary bypass pumping",
      "protective coatings and linings",
      "earthwork / excavation, trenching, and shoring",
    ],
    scopeExcerpt: "motor control centers (supply and retrofit)",
    deadlines: [
      {
        kind: "supplier_form",
        rule: "hours_before_bid",
        at: null,
        hoursBeforeBid: 24,
        rawText: "Interested subs and suppliers should complete and submit the attached solicitation form no later than 24 hours prior to bid.",
      },
    ],
    contacts: [
      { kind: "person", name: "Luke Sherman", title: "Estimating Coordinator", email: null, phone: "(707) 540-9640" },
      { kind: "shared_mailbox", name: "Western Water estimating", title: null, email: "bids@westernwater.com", phone: null },
    ],
    requirements: [
      { text: "a waiver of subrogation endorsement to their worker's compensation insurance", mandatory: true, credential: "Workers' comp waiver of subrogation endorsement" },
    ],
    responseMethod: "Complete and submit the attached solicitation form to bids@westernwater.com",
  },
};

export const GARNEY: SeedSource = {
  key: "garney-sd462",
  url: "https://www.sbeinc.com/cms.cfm?classifiedID=67895&fuseaction=classified.detail&pageID=51",
  title: "Public Legal Notice — Garney Pacific — Main WWTP Secondary Reactors Rehabilitation Phase 2",
  kind: "contractor_notice",
  retrievedAt: RETRIEVED,
  stampedDate: null,
  text: [
    "Garney Pacific, Inc. is bidding the Main Wastewater Treatment Plant Secondary Reactors Rehabilitation Phase 2 Project as a general contractor and is actively seeking DBE participation, including but not limited to firms with MBE, WBE, or SBE certifications.",
    "Owner: East Bay Municipal Utility District. Location: Oakland, CA. Bid date: December 2nd, 2026, by 2:00PM PT. Quotes due: November 17, 2026, by 2:00PM PT.",
    "Scope: Lead Abatement, Rebar, Metals Fabrication, Painting & Coatings, Electrical & Instrumentation, Trucking & Hauling, Concrete Resurfacing & Restoration, Bypass Pumping, Valves & Pipe, Concrete Materials, FRP Reinforcing Systems, Access Hatches, Slide Gates",
    "Project includes rehabilitation and replacement of motor control center components; rehabilitation of reactor mixer and aerator; installation of new or improvements to existing instrumentation and their associated electrical and instrumentation scope.",
    "Garney Pacific, Inc. is a union contractor and all subcontractors on the project must utilize union labor. All potential subcontractors are prepared to provide a 100% Payment and Performance Bond from a US Treasury listed Surety Company.",
    "Contact: Alyssa Callaway, alyssa.callaway@garney.com. Bid documents: https://www.garney.com/upcoming-bids/",
  ].join("\n"),
  extraction: {
    isSupplierSolicitation: true,
    bidder: "Garney Pacific",
    bidderDomain: "garney.com",
    projectTitle: "Main Wastewater Treatment Plant Secondary Reactors Rehabilitation, Phase 2",
    projectNumber: null,
    owner: "East Bay Municipal Utility District",
    location: "Oakland, CA",
    ownerBidOpening: "2026-12-02T14:00:00-08:00",
    estimate: null,
    scopes: [
      "Electrical & Instrumentation",
      "rehabilitation and replacement of motor control center components",
      "Lead Abatement",
      "Painting & Coatings",
      "Bypass Pumping",
      "Valves & Pipe",
      "Slide Gates",
      "Access Hatches",
    ],
    scopeExcerpt: "rehabilitation and replacement of motor control center components",
    deadlines: [
      { kind: "contractor_quote", rule: "absolute", at: "2026-11-17T14:00:00-08:00", hoursBeforeBid: null, rawText: "Quotes due: November 17, 2026, by 2:00PM PT." },
    ],
    contacts: [{ kind: "person", name: "Alyssa Callaway", title: null, email: "alyssa.callaway@garney.com", phone: null }],
    requirements: [
      { text: "all subcontractors on the project must utilize union labor", mandatory: true, credential: "Union labor" },
      { text: "100% Payment and Performance Bond from a US Treasury listed Surety Company", mandatory: true, credential: "100% payment & performance bond" },
    ],
    responseMethod: "Email quote with redlines/comments to alyssa.callaway@garney.com",
  },
};

export const SEED_NOTICES = [WESTERN_WATER, GARNEY];

export const DEFAULT_DESCRIPTION =
  "We retrofit motor control centers and install instrumentation at Northern California water plants. Our sales rep wants contractors currently collecting supplier quotes.";
