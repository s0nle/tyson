import {
  Activity,
  type Actor,
  type ActivityType,
  type BillableOperation,
  ContractError,
  LedgerEntry,
  type Me,
  PRICES,
  STARTING_CREDITS,
  toZonedIso,
} from "@/contract";
import type { Db } from "../db";
import type { Deps } from "../deps";

export interface Org {
  id: string;
  name: string;
}

export const iso = (deps: Deps) => toZonedIso(deps.now());

export const AGENTS = {
  planner: { kind: "agent", name: "Planner agent", role: "planner" },
  builder: { kind: "agent", name: "Builder agent", role: "builder" },
  reviewer: { kind: "agent", name: "Reviewer agent", role: "reviewer" },
  security: { kind: "agent", name: "Security agent", role: "security" },
} as const satisfies Record<string, Actor>;
export const SYSTEM: Actor = { kind: "system", name: "System" };
export const rep = (org: Org): Actor => ({ kind: "rep", name: org.name });

/** Demo auth: `Authorization: Bearer <name>`. First sight creates the org with starting credits. */
export async function resolveOrg(deps: Deps, rawName: string): Promise<Org> {
  const name = decodeURIComponent(rawName).trim().toLowerCase().slice(0, 60);
  if (!name) throw new ContractError("unauthorized", "Sign in with a name");
  const found = await deps.db.query<Org>("select id, name from orgs where name = $1", [name]);
  if (found[0]) return found[0];
  const org = { id: crypto.randomUUID(), name };
  await deps.db.tx(async (db) => {
    await db.query("insert into orgs (id, name, created_at) values ($1, $2, $3) on conflict (name) do nothing", [org.id, name, iso(deps)]);
  });
  const again = await deps.db.query<Org>("select id, name from orgs where name = $1", [name]);
  const o = again[0] as Org;
  await grant(deps, deps.db, o, STARTING_CREDITS, "Starting demo credits");
  deps.afterResponse(() => deps.billing.ensureCustomer(o.id, o.name));
  return o;
}

export async function logActivity(
  deps: Deps,
  db: Db,
  org: Org,
  a: {
    actor: Actor;
    type: ActivityType;
    summary: string;
    leadId?: string | null;
    runId?: string | null;
    channel?: "email" | "linkedin" | null;
    variant?: "A" | "B" | null;
    billingEventId?: string | null;
  },
): Promise<Activity> {
  const row = Activity.parse({
    id: crypto.randomUUID(),
    at: iso(deps),
    leadId: a.leadId ?? null,
    runId: a.runId ?? null,
    actor: a.actor,
    type: a.type,
    summary: a.summary,
    channel: a.channel ?? null,
    variant: a.variant ?? null,
    billingEventId: a.billingEventId ?? null,
  });
  await db.query("insert into activity (id, org_id, lead_id, at, data) values ($1, $2, $3, $4, $5::jsonb)", [
    row.id,
    org.id,
    row.leadId,
    new Date(row.at).toISOString(),
    JSON.stringify(row),
  ]);
  return row;
}

export async function listActivity(db: Db, org: Org, leadId?: string, limit = 200): Promise<Activity[]> {
  const rows = leadId
    ? await db.query<{ data: unknown }>("select data from activity where org_id = $1 and lead_id = $2 order by at desc limit $3", [org.id, leadId, limit])
    : await db.query<{ data: unknown }>("select data from activity where org_id = $1 order by at desc limit $2", [org.id, limit]);
  return rows.map((r) => Activity.parse(r.data));
}

// ---------------- credits ledger ----------------

export async function ledger(db: Db, org: Org): Promise<LedgerEntry[]> {
  const rows = await db.query<{ data: unknown }>("select data from ledger where org_id = $1 order by at desc", [org.id]);
  return rows.map((r) => LedgerEntry.parse(r.data));
}

export function totals(entries: LedgerEntry[]) {
  const granted = entries.filter((e) => e.credits > 0).reduce((s, e) => s + e.credits, 0);
  const spent = -entries.filter((e) => e.credits < 0 && e.status === "settled").reduce((s, e) => s + e.credits, 0);
  const reserved = -entries.filter((e) => e.credits < 0 && e.status === "pending").reduce((s, e) => s + e.credits, 0);
  return { granted, spent, available: granted - spent - reserved };
}

async function writeLedger(db: Db, org: Org, e: LedgerEntry) {
  await db.query(
    `insert into ledger (id, org_id, at, data) values ($1, $2, $3, $4::jsonb)
     on conflict (id) do update set data = excluded.data`,
    [e.id, org.id, new Date(e.at).toISOString(), JSON.stringify(LedgerEntry.parse(e))],
  );
}

export async function grant(deps: Deps, db: Db, org: Org, credits: number, note: string) {
  await writeLedger(db, org, {
    id: `grant_${crypto.randomUUID()}`,
    at: iso(deps),
    operation: "grant",
    credits,
    leadId: null,
    runId: null,
    status: "settled",
    flexprice: "disabled",
    note,
  });
}

/**
 * Reserve credits BEFORE calling a paid provider. Serialized per org (row lock), so two concurrent clicks
 * cannot both spend the last credits. Throws insufficient_credits without touching the provider.
 */
export async function reserve(
  deps: Deps,
  org: Org,
  op: BillableOperation,
  ref: { leadId: string | null; runId: string | null; eventId: string },
): Promise<LedgerEntry> {
  return deps.db.tx(async (db) => {
    await db.query("select id from orgs where id = $1 for update", [org.id]);
    const existing = await db.query<{ data: unknown }>("select data from ledger where id = $1", [ref.eventId]);
    if (existing[0]) return LedgerEntry.parse(existing[0].data);
    const t = totals(await ledger(db, org));
    const price = PRICES[op];
    if (t.available < price) {
      throw new ContractError("insufficient_credits", `${op} costs ${price} credits; ${t.available} available. Blocked before calling the provider.`, 402, {
        available: t.available,
        price,
      });
    }
    const e: LedgerEntry = {
      id: ref.eventId,
      at: iso(deps),
      operation: op,
      credits: -price,
      leadId: ref.leadId,
      runId: ref.runId,
      status: "pending",
      flexprice: deps.billing.kind === "live" ? "pending" : "disabled",
      note: "Reserved",
    };
    await writeLedger(db, org, e);
    return e;
  });
}

/** Provider succeeded and the result is billable → settle and send the usage event with the same id. */
export async function settle(deps: Deps, org: Org, e: LedgerEntry, note: string): Promise<LedgerEntry> {
  let settled: LedgerEntry = { ...e, status: "settled", note };
  await writeLedger(deps.db, org, settled);
  if (deps.billing.kind === "live") {
    const ok = await deps.billing
      .ingest({ id: e.id, orgId: org.id, eventName: e.operation, leadId: e.leadId, runId: e.runId, at: e.at })
      .catch(() => false);
    settled = { ...settled, flexprice: ok ? "synced" : "failed" };
    await writeLedger(deps.db, org, settled);
  }
  return settled;
}

/** Provider failed or result not billable → release the reservation (kept visible with 0 credits). */
export async function release(deps: Deps, org: Org, e: LedgerEntry, note: string) {
  await writeLedger(deps.db, org, { ...e, credits: 0, status: "failed", flexprice: "disabled", note });
}

export async function meFor(deps: Deps, org: Org): Promise<Me> {
  const t = totals(await ledger(deps.db, org));
  return {
    user: { id: org.id, name: org.name },
    org: { id: org.id, name: org.name },
    credits: { available: t.available, spent: t.spent, granted: t.granted },
    providers: {
      openai: deps.ai.kind,
      tavily: deps.search.kind,
      hunter: deps.enrich.kind,
      resend: deps.mail.kind,
      flexprice: deps.billing.kind,
    },
  };
}

/** Wipe one org's working data and restore starting credits (rehearsals). */
export async function resetOrg(deps: Deps, org: Org) {
  await deps.db.tx(async (db) => {
    for (const t of ["docs", "nodes", "edges", "activity", "ledger", "idempotency"]) {
      await db.query(`delete from ${t} where org_id = $1`, [org.id]);
    }
    await grant(deps, db, org, STARTING_CREDITS, "Starting demo credits (reset)");
  });
}

/** Idempotency: same key → same stored result, never re-applied. */
export async function idempotent<T>(deps: Deps, org: Org, key: string, fn: () => Promise<T>): Promise<T> {
  const hit = await deps.db.query<{ result: T }>("select result from idempotency where org_id = $1 and key = $2", [org.id, key]);
  if (hit[0]) return hit[0].result;
  const result = await fn();
  await deps.db.query(
    "insert into idempotency (org_id, key, result) values ($1, $2, $3::jsonb) on conflict do nothing",
    [org.id, key, JSON.stringify(result)],
  );
  return result;
}
