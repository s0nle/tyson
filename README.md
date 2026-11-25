# Tyson — your personal sales agent

**Tyson tells a specialty supplier which contractor wants their exact work right now, the deadline that applies to them,
and who to write to — with a source for every claim and a human approving every message.**

- Live app: <https://contractor-sales-engine-eight.vercel.app>
- Code: <https://github.com/s0nle/tyson>
- System design: [docs/architecture.md](docs/architecture.md)

Built for the *AI GTM Engine* hackathon brief. Beachhead market: Northern California suppliers of motor control center (MCC)
retrofits and instrumentation for water and wastewater plants.

---

## 1. The problem, in one real example

East Bay Municipal Utility District's project **SD-462** (Main Wastewater Treatment Plant Secondary Reactors Rehabilitation,
Phase 2, Oakland) opens bids on **December 2, 2026 at 2:00 PM PT**, with an engineer's estimate of $18.5–19.5 million.
A controls supplier that sees an alert for SD-462 learns one thing: *the project is open.*

That's the wrong question. A supplier doesn't sell to the utility; it sells to the **contractors** bidding the job, and each
contractor runs its own quote process:

| Contractor | What they asked suppliers for | Their supplier deadline | What a rep should do |
|---|---|---|---|
| **Western Water** | "motor control centers (supply and retrofit)", "electrical, instrumentation and controls" | Solicitation form "no later than 24 hours prior to bid" → **Dec 1, 2:00 PM PT** | **Pursue.** Ask for drawings, submit the form |
| **Garney Pacific** | "Electrical & Instrumentation" | "Quotes due: November 17, 2026, by 2:00PM PT" | **Don't.** Window closed a week ago; keep the account for later |

Sources: [Western Water notice](https://www.sbeinc.com/mobile/advertising/cms.cfm?classifiedID=67931&fuseaction=classified.detail&pageID=52) ·
[Garney Pacific notice](https://www.sbeinc.com/cms.cfm?classifiedID=67895&fuseaction=classified.detail&pageID=51) ·
[SD-462 CEQA listing](https://ceqanet.lci.ca.gov/2026050646)

Same project, two opposite sales decisions. A project alert says "open" for both. A rep who trusts it spends a day pricing
Garney's request and finds out it closed on November 17.

Today a rep untangles this by hand: find the contractor notices (they are classified ads and PDFs, not structured data),
read each scope list, work out which deadline is theirs, check eligibility (union labor? bonding? DBE?), find the estimator,
and track it all in a spreadsheet. Multiply by every project in the region, every week.

## 2. What Tyson does

A supplier writes one sentence about what they sell. Tyson then answers four questions for every lead, each with a cited
source:

1. **Who is asking?** The contractor, their named estimator, and their shared bids mailbox, kept separate.
2. **Which part of the work fits us?** The contractor's own scope line matched to the supplier's own services.
3. **When and how do we respond?** The contractor's cutoff (not the utility's bid date), with the arithmetic shown.
4. **Which source proves it?** A verbatim excerpt and link for every claim. If a date can't be read, Tyson says
   "Deadline unknown" instead of guessing.

Then it does the work a rep would otherwise do by hand: verifies the contact (Hunter.io), looks up the company, drafts a
three-touch sequence in the right tone for the recipient's role, holds every message until a human approves that exact
version, sends it, tracks the reply, and meters what each lead cost.

## 3. Why this is a good startup

### 3.1 The market is large and the money flows through exactly this handoff

- The U.S. spent **$2.16 trillion** on construction in 2025, including **$517 billion** of public construction, which grew
  3.6% while private construction fell
  ([Census Bureau, Feb 2026 release](https://www.census.gov/construction/c30/pdf/pr202512.pdf)).
- Public work is where supplier quote requests are published. Federally assisted contracts carry Disadvantaged Business
  Enterprise (DBE) good-faith-effort rules, so prime contractors advertise their sub and supplier needs in classifieds like
  the ones Tyson reads. The two Oakland notices above are examples of exactly that.
- There are **463,000+** specialty trade contractor establishments in the U.S.
  ([NAHB summary of Census data](https://www.nahb.org/news-and-economics/housing-economics-plus/special-studies/special-studies-pages/home-building-census)),
  plus the distributors and manufacturers' reps who sell into them.

**Bottom-up sizing (our estimate, assumptions stated):**

| Step | Number | Assumption |
|---|---|---|
| Specialty contractors + suppliers that quote to primes | ~463,000 | NAHB establishment count; suppliers not added, so this is conservative |
| Price per account per year | ~$3,600 | One rep seat at ~$299/month |
| **Annual software opportunity** | **~$1.7 billion** | 463,000 × $3,600 |
| Third-party check | ~$2.3 billion | Published estimates of the 2025 preconstruction software market (ranges vary by firm) |

The beachhead is far smaller and that's the point: a few hundred water/wastewater electrical, controls and equipment
suppliers in Northern California is enough to prove repeatable value before expanding by trade and region.

### 3.2 The pain is specific, frequent, and costs real money

- **Missed or wasted quotes.** Pricing an electrical package takes hours of estimator time. Pricing one that already closed
  is pure loss; missing one that was open is lost revenue. Tyson's whole design is built around not making that mistake.
- **The information exists but isn't usable.** Contractor requests are public but scattered across newsletters, PDFs and
  agency portals, often with several notices bundled in one weekly issue. No one structures them per supplier.
- **It recurs every week.** Public agencies bid continuously. A supplier that qualifies notices by hand redoes this work
  forever; that makes the product a habit, not a one-time purchase.

### 3.3 Clear differentiation from what exists

| Category | Examples | What they answer | What they don't |
|---|---|---|---|
| Project-lead databases | ConstructConnect, Dodge | "Which projects are out to bid?" | Which **contractor** wants **my scope**, and **their** deadline |
| Bid-management platforms | BuildingConnected, PlanHub | Lets a GC invite subs it already knows | Finding the GCs you don't know yet, from public notices |
| AI sales/SDR tools | Generic sequencing tools | Writes emails to a contact list | Grounding outreach in a real, dated, cited buying signal |
| **Tyson** | — | **Contractor × scope × deadline × contact**, cited, with human-approved outreach | — |

We don't claim nobody connects suppliers to contractors. We claim nobody answers the supplier's actual question with the
contractor's own deadline applied — and the Oakland example shows why that matters.

### 3.4 Why now

- **Large language models can finally read these notices.** The source data is unstructured prose: scope lists, "24 hours
  prior to bid," shared mailboxes. Extracting it reliably was impractical before; Tyson does it with schema-validated
  structured output, then checks that quoted excerpts actually appear on the page and downgrades the evidence when they don't.
- **Public construction is growing** while private construction shrinks (Census, above), which pushes more suppliers toward
  public work and its published quote requests.
- **Buyers now expect agents, but distrust autonomous outreach.** Tyson is built around a hard human-approval gate, which is
  what makes an AI agent acceptable to a small supplier whose reputation rides on every email.

### 3.5 Defensibility that compounds

1. **A graph of who buys what, and when.** Every run writes contractors, scopes, deadlines, contacts and outcomes into a
   knowledge graph. Over time Tyson knows which contractors bid which trades, how early they close supplier windows, and
   which estimators reply. A new entrant starts with none of that.
2. **Outcome data.** Replies, meetings and wins feed back into scoring. The more a supplier uses Tyson, the better its own
   ranking gets.
3. **Trade vocabularies.** Each trade (MCCs, slide gates, traffic control, saw cutting) has its own words for the same work.
   Mapping supplier language to contractor language is accumulated, testable know-how.
4. **Workflow ownership.** Tyson holds the approval queue, the audit trail and the billing ledger. That is the system of
   record for a supplier's bid pursuit, not a side tool.

### 3.6 Business model

- **Subscription plus usage credits**, already metered live through Flexprice in the prototype:

  | Action | Credits | Why it's billed |
  |---|---|---|
  | Lead-specific graph evaluation | 1 | Re-checks scope, deadline and contacts against the current clock |
  | Verified business contact | 3 | Only charged when the provider confirms a usable contact |
  | Human-approved send | 1 | Only charged when the provider accepts the message |
  | Drafts, rejections, edits, cached evidence | 0 | Free, so reps never hesitate to review |

- **Illustrative pricing:** $299/month per seat including 300 credits; overage per credit. Credits are checked *before* any
  paid provider call, so a customer can never be billed for work that was blocked.
- **Margins:** each billed action maps to one or two provider calls (a language-model request, a search, a verification).
  Because usage is metered per event with a stable ID, cost and price can be reconciled per lead and tuned per trade.

### 3.7 Go-to-market

1. **Beachhead:** Northern California water/wastewater electrical, controls and equipment suppliers. The demo customer
   ("Bay Controls Co") is this profile.
2. **Channels:** small-business and DBE associations and trade newsletters (the same places contractors post requests),
   distributor and manufacturers'-rep networks, and direct outreach to estimating managers.
3. **Land and expand:** one rep seat → the whole estimating team → more trades and regions. Each new trade is a vocabulary
   and a search profile, not a new product. The prototype already matches traffic control and concrete cutting/coring.

### 3.8 How we validate before scaling

The test comes straight from the build guide: give estimators the same week of notices **with and without Tyson** and
measure hours spent qualifying, missed deadlines, and the number of leads they would actually pursue. Willingness to pay
follows from fewer wasted quotes and more invitations to bid. Early signal to watch: reply rate on first-touch emails
compared with the supplier's current outreach.

### 3.9 Risks we've designed for

| Risk | How Tyson handles it |
|---|---|
| Wrong deadline sends a rep after a closed request | Owner bid date and contractor cutoff are separate graph nodes; qualification only reads the contractor's; unreadable dates go to "Deadline unknown" |
| Hallucinated facts in outreach | Every claim carries a verbatim excerpt; excerpts not found on the page downgrade the evidence; drafts are grounded only in cited scope |
| Spam or reputational damage | Nothing sends without a human approving that exact version (hash-bound); any edit resets approval; rejected drafts can't be sent |
| Runaway costs | Credits are reserved per organization before any paid call; insufficient balance blocks the call with zero provider requests |
| Stale leads | Leads are re-qualified continuously; when a window closes or a notice changes, unsent drafts are marked stale and blocked |
| Leads outside the service area | Map-based service area (center + radius); projects beyond it are ruled out with the distance shown |

### 3.10 What's already real in this prototype

- **Real public notices.** The Oakland example uses the actual Western Water and Garney Pacific notices and reaches the
  correct opposite decisions.
- **Live discovery across trades.** For a traffic-control company the Planner rewrote the search in contractor language
  ("Traffic Control", "Construction Area Signs") and found real requests from contractors such as Barnard Construction,
  Kiewit, Rados Companies and Taft Electric, then closed the expired ones automatically.
- **Real enrichment.** Hunter.io returned Western Water's real company record (Santa Rosa HQ, Construction & Engineering,
  51–250 employees, LinkedIn page).
- **Live billing.** Flexprice meters `graph_query_evaluated`, `lead_enriched` and `outreach_sent` against a prepaid wallet.
- **Multi-agent collaboration.** Planner, Builder, Reviewer and Security agents run in a shared Band room, hand off by
  @mention, and record their decisions on the lead.
- **Tested.** 24 automated tests, including the full Oakland story end to end, the credit arithmetic (6 → 5 → 2 → 1 →
  blocked), approval invalidation on edit, idempotent sends and replies, malformed dates from live pages, and service-area
  distance rules.

### 3.11 Roadmap

1. Real inbound replies through a verified email domain (the webhook exists; demo replies are simulated and labeled).
2. Addenda tracking: detect amended notices and show what changed in the scope.
3. Contractor history: which GCs bid which trades, and how early they close supplier windows.
4. More trades and regions, plus agency portal sources beyond classifieds.
5. CRM sync for teams that already track pursuits elsewhere.

---

## 4. Technology and sponsor integrations

| Technology | What it does in Tyson |
|---|---|
| **Band** *(sponsor integration)* | Four agents (Planner, Builder, Reviewer, Security) in a shared room; @mention handoffs; approval link back to the rep ([agents/band.ts](agents/band.ts)) |
| **Flexprice** *(sponsor integration)* | Usage metering for `graph_query_evaluated`, `lead_enriched`, `outreach_sent`; prepaid wallet; credit gate before paid calls |
| OpenAI (`gpt-5-mini`) | Buyer profile, search planning, notice extraction, outreach drafts, competitor summaries |
| Tavily | Live web search for contractor sub-bid requests and competitors |
| Hunter.io | Email verification, company firmographics, LinkedIn lookup |
| Resend | Outbound email delivery |
| OpenStreetMap + Leaflet | Service-area map and project distances |
| Next.js on Vercel | App and API, deployed |
| Neon Postgres | Leads, audit log, credit ledger, and the knowledge graph (labeled nodes and typed edges) |

## 5. Run it (zero setup)

```bash
npm install
npm run dev          # http://localhost:3000 — PGlite database + deterministic fakes, no keys needed
npm run check        # typecheck + 24 tests (logic + full product story through the typed client)
```

Start with your company name and a description of what you sell. The app saves this information and builds a buyer profile
for review before discovery. Each browser workspace starts with 6 demo credits. Existing demo accounts still work through
`?as=<name>`; normal onboarding creates a separate workspace automatically.

### Demo script (2–3 min)
1. Enter your company name, what you do, and your city and state or ZIP code, then choose *Create my workspace*. Your location appears in *Search settings*. A unique map match starts with an editable 25-mile radius. Otherwise discovery uses the entered location until you choose a map center.
2. Hover or click **Your business** on the left. Buyer fields collapse to a title, confidence percentage, and colored bar.
   Expand a field to keep, edit, or dismiss it, then *Approve & use for search*. A yellow caution remains until approval.
3. *Find opportunities*. The progress bar shows the current agent and a short status. Results appear above completed progress.
   Competitors live in the right sidebar; hover or click a company title to expand it.
4. On **Western Water**, *Prepare outreach* expands the match in place. *Match details & source evidence* includes deadlines,
   scope citations, fit scoring, the graph path, and *Re-evaluate* (1 credit).
5. Verify the labeled test contact (3 credits), draft an email, review the draft, edit if needed (approval resets), and approve.
   *Send to test inbox* (1 credit), then reply from the inbox or use the labeled *Simulate a reply* action.
6. The left-hand pipeline summary updates to **Replied**. Click a stage to filter matches. The **Workspace credits** menu
   in the top bar shows 5 used and 1 left. Verifying another contact is blocked by the credit gate, with zero provider calls.
7. Set a demo replay time of `2026-12-01 15:00` in the match re-evaluation controls to show Western Water closing too.

Outreach never navigates away from its match. `/pipeline` and old `/leads/:id` links redirect into the main workspace.
Draft progress is labeled as estimated because draft generation is a single request; 100% appears only after it succeeds.

## 6. Configuration (`.env.local` locally, Vercel env in production)

| Variable | Purpose | Without it |
|---|---|---|
| `DATABASE_URL` | Neon/Postgres (Vercel Storage) | PGlite in the OS temp dir |
| `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5-mini`) | Buyer profile, search planning, notice extraction, drafts, competitor summaries | Deterministic fake |
| `TAVILY_API_KEY` | Live discovery + competitor scan | Curated Oakland snapshots only |
| `HUNTER_API_KEY` | Email verification, company and person lookup | Fake verifier (role mailboxes → unknown) |
| `RESEND_API_KEY`, `RESEND_FROM`, `DEMO_INBOX` | Real sends to a team-controlled inbox | Simulated delivery |
| `INBOUND_DOMAIN`, `WEBHOOK_SECRET` | Replies to `reply+<messageId>@INBOUND_DOMAIN` hit `/api/webhooks/resend?secret=…` | *Simulate reply* button |
| `FLEXPRICE_API_KEY`, `FLEXPRICE_BASE_URL` | Usage events + wallet balance | Local ledger only |
| `BAND_*_ID`, `BAND_*_KEY`, `BAND_REP_HANDLE` | Band room agents (`npx tsx --env-file=.env.local agents/band.ts`) | Agents run as attributed steps inside the app only |

The app shows which providers are **Live** vs **Simulated**, so the demo states honestly what actually ran.

## 7. Architecture

See [docs/architecture.md](docs/architecture.md). Short version:

```
src/contract   Zod schemas, endpoint table, typed createClient, shared pure logic (deadlines, qualification, scoring, matching, approval hash)
src/server     router generated from the endpoint table · handlers · services · providers (real + fake) · Postgres/PGlite
src/app        Next.js pages + one catch-all API route (/api/v1/[...path]) + Resend inbound webhook + cron refresh
agents         Band room bridge: four SDK agents that act on the app through the same typed client
test           logic tests + the whole product story through the real client on in-memory Postgres
```

**Rules both sides keep:** change the contract first; the UI only calls `api("endpointName", …)`; the server validates every request
**and its own responses** with the contract; services never call `new Date()`, `process.env` or an SDK directly (everything comes via `Deps`).

## 8. Deploy (Vercel)

```bash
npx vercel login
npx vercel link
# Vercel dashboard → Storage → Create → Neon → connect to this project (sets DATABASE_URL)
npx vercel env add OPENAI_API_KEY   # + the other keys above
npx vercel deploy --prod
curl https://<app>/api/health
```

Tables are created on first request (`create table if not exists`), so no migration step is needed.

Demo auth is a bearer name (`Authorization: Bearer <name>`), deliberately simple for the hackathon.
