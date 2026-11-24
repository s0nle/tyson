# Contractor Sales Engine Implementation Plan

> Executed natively in one session (solo, hard deadline 15:30 PT). Steps use checkbox syntax.

**Goal:** Ship the approved design (`docs/design.md`) as one deployed Next.js app.
**Architecture:** contract-first (`src/contract`) → router + handlers + services (`src/server`) → pages (`src/app`).
**Tech Stack:** Next 16, React 19, Tailwind 4, Zod 4, postgres.js / PGlite, OpenAI, Vitest.
**Spec:** docs/design.md

## Global Constraints
- Every request/response goes through `src/contract/api.ts` endpoints; UI uses only `api(...)`.
- Times compared as instants; displayed in `America/Los_Angeles`.
- Credits are integers; starting balance 6; prices 1 / 3 / 1.
- No key → fake provider, `console.warn` once.

## Review Focus
- Replay clock after 2026-12-01T14:00-08:00 → Western Water becomes closed.
- Notice with no deadline → `needs_review` ("Deadline unknown"), never actionable.
- Double-click send / verify with the same idempotency key → one charge, one provider call.
- Edit after approval → status back to draft; send refused with `conflict`.
- Balance 1, verify (3) → `insufficient_credits`, zero enrichment calls.

### Task 1: Contract + shared logic (tests: deadlines, qualify, score, approval hash, client)
### Task 2: DB + router + deps + harness (test: e2e story through client on PGlite)
### Task 3: Services — profile/ICP, discovery run (seed + live), leads, contacts, messages, billing, analytics
### Task 4: Providers — OpenAI, Tavily, Hunter, Resend (+ inbound webhook), Flexprice
### Task 5: UI — profile, opportunities, lead detail, pipeline
### Task 6: Deploy to Vercel + Neon, README, architecture doc
