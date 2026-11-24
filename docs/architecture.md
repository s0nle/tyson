# System design — Contractor Sales Engine

## 1. Flow

```
Supplier description ──► Planner: ICP inference (OpenAI, structured output → Zod)  ──► rep accepts / edits / dismisses ──► approve
                                                                                                          │
Discovery run (returns run id immediately, work continues in Next `after()`)  ◄───────────────────────────┘
  Builder   retrieve: curated snapshots (owner listing + contractor notices) + live Tavily search → OpenAI extraction
            write graph: Project, Owner, Notice, Contractor, Scope, Person, Deadline, Signal, Service, Competitor
            traverse: (Supplier)-[:OFFERS]->(Service)-[:MATCHES]->(Scope)<-[:REQUESTS]-(Notice)-[:ISSUED_BY]->(Contractor)
  Reviewer  per candidate: scope check, owner-vs-supplier deadline, contact attribution → keep or @builder remove
  Security  destination published in source? HTTPS evidence? attachments? dispatch endpoint = team test inbox
Lead detail: evidence · timeline · contacts · graph path · drafts
  HITL: draft (builder) → edit (rep, new revision) → approve exact revision+recipient+channel (hash) → send (credit-gated) → reply
Pipeline: Matched → Contacted → Replied → Meeting booked → Closed won/lost, milestones, analytics, ledger
```

## 2. Graph ontology (Postgres `nodes` / `edges`)

| Node label | Example | Key props |
|---|---|---|
| Company | Western Water (bidder), EBMUD (owner), Bay Controls Co (supplier) | role, domain |
| Service | "Motor control center (MCC) retrofits" | — |
| Project | SD-462 · Main WWTP Secondary Reactors Rehabilitation Phase 2 | bidOpening, location |
| Notice | "Sub Bid Request — Western Water — …" | url, version, isCurrent, previousVersion |
| Scope | "motor control centers (supply and retrofit)" | notice |
| Person | Luke Sherman / Western Water estimating (shared mailbox) | kind, title, email, phone |
| Deadline | "…no later than 24 hours prior to bid" / Owner bid opening | kind (owner_bid_opening · contractor_quote · supplier_form) |
| Signal | Supplier quote request (Western Water) | retrievedAt |
| Competitor | firms offering the same service | category, url |

Edges: `OFFERS` (supplier→service), `MATCHES` (service→scope, props.strength = named_equipment | trade_level),
`REQUESTS` (notice→scope), `ISSUED_BY` (notice→contractor), `FOR_PROJECT` (notice→project), `OWNS` (owner→project),
`NAMES_CONTACT` (notice→person), `WORKS_AT` (person→company), `HAS_DEADLINE` (notice|project→deadline),
`EMITTED` (company→signal), `COMPETES_WITH` (competitor→supplier).

**The deadline rule lives in the graph shape:** the utility's bid opening hangs off the `Project`; supplier cutoffs hang off each
`Notice`. Qualification only ever reads Notice deadlines, so the Oakland error (chasing an expired request because the project
is still open) cannot happen.

Traversal (`src/server/services/graph.ts · matchCandidates`) is the build guide's Cypher expressed as joins over `edges`; the
lead-scoped subgraph (`subgraphForNotice`) is what the lead page draws. Changing the supplier's capabilities rewrites `OFFERS` /
`MATCHES`, so the same notices produce different leads.

## 3. Qualification and scoring (`src/contract`, shared by server and UI, unit-tested)

1. Hard constraints first: mandatory credential the supplier lacks → `disqualified`; outside region → `disqualified`;
   earliest supplier-applicable deadline passed → `closed_window`; no supplier deadline → `needs_review` ("Deadline unknown").
2. Relative deadlines ("24 hours prior to bid") are computed on instants and rendered in the project zone with a derivation string.
3. Score = 40 technical scope + 25 explicit intent + 20 time-vs-quote-prep + 15 contact evidence; tier A ≥ 75, B ≥ 55; only
   actionable leads get a tier. Evidence strength (strong/moderate/weak) is separate; an LLM excerpt not found verbatim in the
   page downgrades it.

## 4. HITL gate

`approvalHash(revision, channel, recipient, subject, body)` is computed in the browser from what the rep sees and re-computed on the
server. Any edit creates a new revision with no approval. `sendMessage` refuses unless status is `approved` and the hash still
matches; rejected messages can never be sent; a lead whose window closed can't be drafted or sent. Sends are idempotent per
message (no double send), replies are deduped by provider id (no duplicate stage change).

## 5. Credits / Flexprice

Prices: `graph_query_evaluated` 1 · `lead_enriched` 3 (only when the provider verifies a usable contact) · `outreach_sent` 1.
`reserve()` locks the org row (`SELECT … FOR UPDATE`), checks available = granted − settled − pending, and throws
`insufficient_credits` **before** any provider call. On success `settle()` sends the usage event to Flexprice with the same event
id stored on the ledger row and the activity row; on failure `release()` zeroes the reservation. Idempotency keys make retries free.

## 6. Agents

Planner, Builder, Reviewer and Security are attributed actors on every run step and activity row (`actor.kind = "agent"`,
`actor.role`). Handoffs are written as @mentions in the run feed. Band Desktop room integration: see `agents/` (if present).

## 7. Deployment

One Next.js app on Vercel (pages + `/api/v1/[...path]` catch-all, `maxDuration` 300 s for discovery) and Neon Postgres from
Vercel Storage. Secrets stay server-side. Locally and in tests the same SQL runs on PGlite.

## 8. Additions for modules 3–5

- **Ontology:** the supplier's offerings are `Product` nodes (Company -[OFFERS]-> Product -[MATCHES]-> Scope). Lead decisions are
  edges: `(Contractor)-[:MATCHED_TO {status, score, tier, asOf}]->(Supplier)`. Outreach is in the graph too:
  `(Person)-[:CONTACTED_VIA {channel, at}]->(Message)-[:SENT_BY]->(Supplier)` and `(Person)-[:REPLIED_TO]->(Message)`.
- **Continuous re-qualification:** `POST /api/v1/leads/refresh` re-runs every lead against the clock and its graph evidence.
  Status changes are logged as `lead_requalified` (actor: system), and unsent drafts on a lead that closed or whose notice
  version changed get a `staleReason`, which blocks approval and sending. Reads trigger it at most once a minute;
  Vercel Cron (`/api/cron/refresh`, daily) is the backstop.
- **Enrichment:** `POST /api/v1/leads/:id/enrich-company` (Hunter company lookup, free) records verified domain, HQ, industry,
  NAICS, size and LinkedIn company page, and updates the company tier. Verifying a contact (3 credits when deliverable) also
  looks up that person's LinkedIn URL.
- **Sequences:** `POST /api/v1/leads/:id/sequence` drafts email (day 0) → LinkedIn note (day 1) → follow-up email (day 3).
  Each touch carries its persona rules (tone, length, CTA by role), the value proposition its variant tests, and the trigger
  signal; each needs its own approval. Analytics report variants by value proposition and channel.
- **Approval queue:** `GET /api/v1/queue` lists every draft and approved message across leads.
- **Not built (no data in this market):** warm-intro paths via `previously_employed_at`, and competitor displacement from renewal signals.
