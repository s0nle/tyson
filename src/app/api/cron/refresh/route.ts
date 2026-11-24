import { getServer } from "@/server/server";
import { refreshLeads } from "@/server/services/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron backstop for continuous re-qualification (ordinary reads also refresh lazily). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  const { deps } = await getServer();
  const orgs = await deps.db.query<{ id: string; name: string }>("select id, name from orgs");
  const results = [];
  for (const org of orgs) {
    const r = await refreshLeads(deps, org).catch((e) => ({ error: String(e) }));
    results.push({ org: org.name, ...r });
  }
  return Response.json({ refreshed: results.length, results });
}
