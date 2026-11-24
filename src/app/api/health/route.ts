import { getServer } from "@/server/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { deps } = await getServer();
  await deps.db.query("select 1");
  return Response.json({ ok: true, providers: { ai: deps.ai.kind, search: deps.search.kind, enrich: deps.enrich.kind, mail: deps.mail.kind, billing: deps.billing.kind } });
}
