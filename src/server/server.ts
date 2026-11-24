import { after } from "next/server";
import { type Database, openDatabase } from "./db";
import { configFromEnv, type Deps, pickProviders } from "./deps";
import { handlers } from "./handlers";
import { type Api, createApi } from "./http";

let server: Promise<{ api: Api; deps: Deps; database: Database }> | undefined;

/** Process-wide singleton: Postgres when DATABASE_URL is set, else PGlite in .pglite (zero setup). */
export function getServer() {
  server ??= (async () => {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url && process.env.VERCEL) throw new Error("DATABASE_URL is not set on this deployment");
    const database = await openDatabase(url ? { url } : { dataDir: process.env.PGLITE_DIR ?? ".pglite" });
    await database.migrate();
    const deps: Deps = {
      db: database.db,
      now: () => new Date(),
      log: { error: (e) => console.error(e), info: (m) => console.log(m) },
      ...pickProviders(),
      afterResponse: (task) => {
        try {
          after(() => task().catch((e) => console.error(e)));
        } catch {
          void task().catch((e) => console.error(e));
        }
      },
      config: configFromEnv(),
    };
    return { api: createApi(deps, handlers), deps, database };
  })();
  return server;
}
