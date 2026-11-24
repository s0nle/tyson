import { createClient } from "../src/contract";
import { openDatabase } from "../src/server/db";
import { defaultConfig, type Deps } from "../src/server/deps";
import { handlers } from "../src/server/handlers";
import { createApi } from "../src/server/http";
import { fakeAi, fakeBilling, fakeGeo, fakeSearch, makeFakeEnrich, makeFakeMail } from "../src/server/providers/fakes";

export async function startBackend(overrides: Partial<Omit<Deps, "db">> = {}) {
  const database = await openDatabase();
  await database.migrate();
  let clock = new Date("2026-11-24T09:00:00-08:00");
  const enrich = makeFakeEnrich();
  const mail = makeFakeMail();
  const deps: Deps = {
    db: database.db,
    now: () => clock,
    log: { error: (e) => console.error(e), info: () => {} },
    ai: fakeAi,
    search: fakeSearch,
    enrich,
    mail,
    billing: fakeBilling,
    geo: fakeGeo,
    afterResponse: (t) => t(),
    config: { ...defaultConfig, demoInbox: "team-inbox@example.com" },
    ...overrides,
  };
  const api = createApi(deps, handlers);
  return {
    deps,
    enrich,
    mail,
    as: (user: string) =>
      createClient({ baseUrl: "http://backend.test", fetch: api.fetch, headers: () => ({ authorization: `Bearer ${user}` }) }),
    set(iso: string) {
      clock = new Date(iso);
    },
    close: () => database.close(),
  };
}
