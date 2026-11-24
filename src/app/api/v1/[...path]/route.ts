import { getServer } from "@/server/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const { api } = await getServer();
  return api.handle(req);
}
export { handle as GET, handle as POST };
