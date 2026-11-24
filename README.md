# Contractor Sales Engine

A supplier describes what it sells. The app finds contractors **currently collecting supplier quotes** for that work,
cites the public notice behind every claim, applies **that contractor's** deadline (not the utility's bid date), and takes a
rep from a reviewed draft to a real reply in one opportunities workspace — with every paid action metered against a credit wallet.

Built for the *AI GTM Engine* hackathon brief. First market: Northern California suppliers of motor control center (MCC)
retrofits and instrumentation for water and wastewater plants.

## The Oakland demo in one paragraph

EBMUD's **SD-462** (Main WWTP Secondary Reactors Rehabilitation, Phase 2, bid opening **Dec 2, 2026 2:00 PM PT**) has two
contractors asking suppliers for prices. **Western Water** wants "motor control centers (supply and retrofit)" and a solicitation
form "no later than 24 hours prior to bid" → the engine derives **Dec 1, 2:00 PM PT** and says *Pursue*. **Garney Pacific** wants
"Electrical & Instrumentation" quotes by **Nov 17, 2:00 PM PT** → *Published window closed*, account kept, outreach suppressed.
Same project, two different sales decisions. Sources:
[Western Water notice](https://www.sbeinc.com/mobile/advertising/cms.cfm?classifiedID=67931&fuseaction=classified.detail&pageID=52) ·
[Garney Pacific notice](https://www.sbeinc.com/cms.cfm?classifiedID=67895&fuseaction=classified.detail&pageID=51) ·
[SD-462 CEQA listing](https://ceqanet.lci.ca.gov/2026050646).

## Run it (zero setup)

```bash
npm install
npm run dev          # http://localhost:3000 — PGlite database + deterministic fakes, no keys needed
npm run check        # typecheck + 17 tests (logic + full product story through the typed client)
```

Start with your company name and a description of what you sell. The app saves this information and builds a buyer profile
for review before discovery. Each browser workspace starts with 6 demo credits. Existing demo accounts still work through
`?as=<name>`; normal onboarding creates a separate workspace automatically.

### Demo script (2–3 min)
1. On the welcome screen, enter your business details or choose *Try the Oakland example*, then *Create my workspace*.
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

## Configuration (`.env.local` locally, Vercel env in production)

| Variable | Purpose | Without it |
|---|---|---|
| `DATABASE_URL` | Neon/Postgres (Vercel Storage) | PGlite in the OS temp dir |
| `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5-mini`) | ICP inference, notice extraction, drafts, competitor summaries | Deterministic fake |
| `TAVILY_API_KEY` | Live discovery + competitor scan | Curated Oakland snapshots only |
| `HUNTER_API_KEY` | Email verification | Fake verifier (role mailboxes → unknown) |
| `RESEND_API_KEY`, `RESEND_FROM`, `DEMO_INBOX` | Real sends to a team-controlled inbox | Simulated delivery |
| `INBOUND_DOMAIN`, `WEBHOOK_SECRET` | Replies to `reply+<messageId>@INBOUND_DOMAIN` hit `/api/webhooks/resend?secret=…` | *Simulate reply* button |
| `FLEXPRICE_API_KEY`, `FLEXPRICE_BASE_URL` | Usage events + wallet balance | Local ledger only |

The sidebar shows which providers are **Live** vs **Fake**, so the demo states honestly what actually ran.

## Architecture

See [docs/architecture.md](docs/architecture.md). Short version:

```
src/contract   Zod schemas, endpoint table, typed createClient, shared pure logic (deadlines, qualification, scoring, matching, approval hash)
src/server     router generated from the endpoint table · handlers · services · providers (real + fake) · Postgres/PGlite
src/app        Next.js pages + one catch-all API route (/api/v1/[...path]) + Resend inbound webhook
test           logic tests + the whole product story through the real client on in-memory Postgres
```

**Rules both sides keep:** change the contract first; the UI only calls `api("endpointName", …)`; the server validates every request
**and its own responses** with the contract; services never call `new Date()`, `process.env` or an SDK directly (everything comes via `Deps`).

## Deploy (Vercel)

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
