import type { z } from "zod";
import { ContractError, type EndpointName, endpoints, type ResponseOf } from "@/contract";
import type { Deps } from "./deps";
import { type Org, resolveOrg } from "./services/base";

type E<K extends EndpointName> = (typeof endpoints)[K];
type In<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface Ctx<K extends EndpointName> {
  deps: Deps;
  req: Request;
  params: Record<string, string>;
  query: In<E<K>["query"]>;
  body: In<E<K>["body"]>;
  org(): Promise<Org>;
}
export type Handler<K extends EndpointName> = (ctx: Ctx<K>) => Promise<ResponseOf<K>>;
export type Handlers = { [K in EndpointName]?: Handler<K> };

const routes = (Object.keys(endpoints) as EndpointName[]).map((name) => {
  const e = endpoints[name];
  const keys: string[] = [];
  const re = new RegExp(
    `^${e.path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
      keys.push(k);
      return "([^/]+)";
    })}/?$`,
  );
  return { name, method: e.method, re, keys };
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export function createApi(deps: Deps, handlers: Handlers) {
  async function handle(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url);
      let methodMismatch = false;
      for (const r of routes) {
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        if (r.method !== req.method) {
          methodMismatch = true;
          continue;
        }
        const e = endpoints[r.name];
        const handler = handlers[r.name] as Handler<EndpointName> | undefined;
        if (!handler) throw new ContractError("not_found", `${r.name} is not implemented yet`);
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => {
          params[k] = decodeURIComponent(m[i + 1] ?? "");
        });
        for (const [k, v] of Object.entries(params)) if (k.endsWith("Id") && !UUID.test(v)) throw new ContractError("not_found", `Unknown ${k}`);
        let query: unknown;
        if (e.query) {
          const p = e.query.safeParse(Object.fromEntries(url.searchParams));
          if (!p.success) throw new ContractError("bad_request", "Invalid query", 400, p.error.issues);
          query = p.data;
        }
        let body: unknown;
        if (e.body) {
          let raw: unknown;
          try {
            const text = await req.text();
            raw = text ? JSON.parse(text) : undefined;
          } catch {
            throw new ContractError("bad_request", "Body must be JSON");
          }
          const p = e.body.safeParse(raw);
          if (!p.success) throw new ContractError("bad_request", p.error.issues[0]?.message ?? "Invalid body", 400, p.error.issues);
          body = p.data;
        }
        let org: Org | undefined;
        const result = await handler({
          deps,
          req,
          params,
          query: query as never,
          body: body as never,
          org: async () => {
            if (org) return org;
            const auth = req.headers.get("authorization") ?? "";
            const name = auth.replace(/^Bearer\s+/i, "");
            if (!name) throw new ContractError("unauthorized", "Missing Authorization: Bearer <name> (demo auth)");
            org = await resolveOrg(deps, name);
            return org;
          },
        });
        return json(e.response.parse(result));
      }
      throw methodMismatch ? new ContractError("bad_request", "Method not allowed", 405) : new ContractError("not_found", "No such endpoint");
    } catch (err) {
      if (err instanceof ContractError) return json(err.toBody(), err.status);
      deps.log.error(err);
      const detail = process.env.DEBUG_ERRORS === "1" ? String(err instanceof Error ? err.message : err).slice(0, 500) : undefined;
      return json(new ContractError("internal", "Internal error", 500, detail).toBody(), 500);
    }
  }
  return { handle, fetch: (input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init)) };
}
export type Api = ReturnType<typeof createApi>;
