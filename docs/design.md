# Contractor Sales Engine — Design (approved 2026-11-24)

## Intent
A supplier describes what it sells. The app finds contractors who are *currently* collecting supplier
quotes for that work, proves each claim with a cited source, applies **that contractor's** deadline
(not the utility's bid date), and walks a rep from a reviewed draft to a real reply on a pipeline board.
Hackathon entry for the "AI GTM Engine" brief; submission due 2026-11-24 15:30 PT, solo build.

## Goals
- Oakland SD-462 story works end to end: Western Water = **Pursue** (form cutoff Dec 1 2:00 PM PT,
  derived as "24 h before Dec 2 2:00 PM bid"); Garney Pacific = **Published window closed** (Nov 17 2:00 PM PT).
- Changing supplier capabilities changes the matches (real data: slide gates / bypass pumping match
  other Western Water scopes; lead abatement only matches Garney).
- HITL: approval is bound to the exact revision + recipient + channel; any edit requires fresh approval;
  rejected messages can never be sent.
- Credits: 6 to start; evaluate = 1, verified contact = 3, approved send = 1; insufficient balance blocks
  **before** the provider call. Local ledger always; Flexprice sync when keys exist.
- Runs with zero keys (PGlite + deterministic fakes).

## Non-goals
Python worker, Neo4j (arch tier is optional — graph lives in Postgres `nodes`/`edges`), two Vercel
projects, dashboard localStorage mock, LinkedIn delivery (draft + manual handoff only), live Band room
(stretch).

## Anti-goals
Presenting fabricated notices as real; sending to a real contractor inbox (demo sends go only to a
team-controlled test inbox); treating the owner's bid date as the supplier's deadline.

## Approaches considered
1. Blueprint as written (contract + backend app + dashboard app with mock) — too much surface for 4 h solo.
2. **Chosen:** one Next.js app on Vercel; `src/contract` keeps the blueprint's contract (Zod schemas,
   endpoint table, typed client, router generated from the table, server validates its own responses).
3. Plain Next app without a contract — fastest start, but loses the integration safety that made the last hackathon smooth.

## Architecture
- `src/contract/*` — schemas, endpoint table, `createClient`, shared pure logic
  (deadlines, qualification, scoring, matching, approval hash, billing prices).
- `src/server/*` — `Deps` (db, clock, ai, search, enrich, mail, billing, afterResponse), router, handlers, services.
- DB: Postgres (Neon via Vercel Storage) or PGlite locally/tests. Tables: orgs, docs (jsonb, Zod-validated),
  nodes, edges, activity, ledger, idempotency.
- Providers (each with fake): OpenAI (ICP inference, notice extraction, drafts), Tavily (search),
  Hunter (email verifier), Resend (send + inbound webhook), Flexprice (events + wallet).
- Agent roles (planner / builder / reviewer / security) run as attributed steps of a discovery run;
  every activity row records its actor.
- Screens: Profile & ICP · Opportunities · Lead detail (evidence, graph path, contacts, drafts, approval) ·
  Pipeline (Kanban, activity, ledger, analytics).

## Left to the builder
Visual design, exact copy, score thresholds (A ≥ 75, B ≥ 55), fake-provider behaviour.
