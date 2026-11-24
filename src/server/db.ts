import type { z } from "zod";

/** Minimal SQL surface shared by PGlite (local/tests) and postgres.js (Neon in production). */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

export interface Database {
  db: Db;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const DDL = `
create table if not exists orgs (id uuid primary key, name text unique not null, created_at text not null);
create table if not exists docs (org_id uuid not null, kind text not null, id uuid not null, data jsonb not null, updated_at text not null, primary key (org_id, kind, id));
create table if not exists nodes (org_id uuid not null, id text not null, label text not null, name text not null, props jsonb not null, primary key (org_id, id));
create table if not exists edges (org_id uuid not null, src text not null, rel text not null, dst text not null, props jsonb not null, primary key (org_id, src, rel, dst));
create table if not exists activity (id uuid primary key, org_id uuid not null, lead_id uuid, at text not null, data jsonb not null);
create index if not exists activity_org_at on activity (org_id, at);
create table if not exists ledger (id text primary key, org_id uuid not null, at text not null, data jsonb not null);
create table if not exists idempotency (org_id uuid not null, key text not null, result jsonb not null, primary key (org_id, key));
`;

export async function openDatabase(opts: { url?: string; dataDir?: string } = {}): Promise<Database> {
  if (opts.url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(opts.url, { prepare: false, max: 5, onnotice: () => {} });
    // biome-ignore lint/suspicious/noExplicitAny: postgres.js Sql vs TransactionSql share `unsafe`
    type AnySql = { unsafe: (t: string, p: never[]) => Promise<unknown>; begin?: (fn: (t: any) => Promise<unknown>) => Promise<unknown> };
    const wrap = (s: AnySql): Db => ({
      query: async <T>(text: string, params: unknown[] = []) => {
        const rows = (await s.unsafe(text, params as never[])) as unknown as Record<string, unknown>[];
        // tolerate rows written as JSON string scalars by an earlier driver version
        for (const r of rows) {
          for (const k of ["data", "result", "props"]) {
            const v = r[k];
            if (typeof v === "string" && (v.startsWith("{") || v.startsWith("["))) {
              try {
                r[k] = JSON.parse(v);
              } catch {}
            }
          }
        }
        return rows as unknown as T[];
      },
      tx: async <T>(fn: (db: Db) => Promise<T>) => {
        if (s.begin) return (await s.begin((t: AnySql) => fn(wrap(t)))) as T;
        return fn(wrap(s));
      },
    });
    const db = wrap(sql as unknown as AnySql);
    return {
      db,
      migrate: async () => {
        await sql.unsafe(DDL);
      },
      close: async () => {
        await sql.end();
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = opts.dataDir ? new PGlite(opts.dataDir) : new PGlite();
  type Q = { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> };
  const wrap = (s: Q, inTx: boolean): Db => ({
    query: async <T>(text: string, params: unknown[] = []) => (await s.query(text, params)).rows as T[],
    tx: async <T>(fn: (db: Db) => Promise<T>) => (inTx ? fn(wrap(s, true)) : pg.transaction((t) => fn(wrap(t as Q, true)))),
  });
  return {
    db: wrap(pg as unknown as Q, false),
    migrate: async () => {
      await pg.exec(DDL);
    },
    close: async () => {
      await pg.close();
    },
  };
}

// ---------- document helpers (jsonb rows re-validated with contract schemas) ----------

export async function putDoc(db: Db, orgId: string, kind: string, id: string, data: unknown, now: string) {
  await db.query(
    `insert into docs (org_id, kind, id, data, updated_at) values ($1, $2, $3, $4::text::jsonb, $5)
     on conflict (org_id, kind, id) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [orgId, kind, id, JSON.stringify(data), now],
  );
}

export async function getDoc<S extends z.ZodType>(db: Db, orgId: string, kind: string, id: string, schema: S, lock = false) {
  const rows = await db.query<{ data: unknown }>(
    `select data from docs where org_id = $1 and kind = $2 and id = $3${lock ? " for update" : ""}`,
    [orgId, kind, id],
  );
  return rows[0] ? (schema.parse(rows[0].data) as z.output<S>) : null;
}

export async function listDocs<S extends z.ZodType>(db: Db, orgId: string, kind: string, schema: S) {
  const rows = await db.query<{ data: unknown }>(
    "select data from docs where org_id = $1 and kind = $2 order by updated_at desc",
    [orgId, kind],
  );
  return rows.map((r) => schema.parse(r.data) as z.output<S>);
}
