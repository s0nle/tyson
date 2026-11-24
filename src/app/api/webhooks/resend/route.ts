import { getServer } from "@/server/server";
import { findMessageGlobally, recordReply } from "@/server/services/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend inbound webhook (event "email.received"). Replies are addressed to reply+<messageId>@INBOUND_DOMAIN,
 * so a reply advances only the lead that message belongs to. Replays are deduped by the inbound email id.
 */
export async function POST(req: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && new URL(req.url).searchParams.get("secret") !== secret) return new Response("forbidden", { status: 403 });
  const { deps } = await getServer();
  const evt = (await req.json().catch(() => null)) as {
    type?: string;
    data?: { email_id?: string; id?: string; from?: string; to?: string[] | string; subject?: string; text?: string };
  } | null;
  if (!evt || evt.type !== "email.received" || !evt.data) return Response.json({ ignored: true });
  const to = ([] as string[]).concat(evt.data.to ?? []);
  const messageId = to.map((a) => /reply\+([0-9a-f-]{36})@/i.exec(a)?.[1]).find(Boolean);
  if (!messageId) return Response.json({ ignored: true, reason: "no reply+<id> address" });
  const org = await findMessageGlobally(deps, messageId);
  if (!org) return Response.json({ ignored: true, reason: "unknown message" });
  await recordReply(deps, org, messageId, {
    from: evt.data.from ?? "unknown sender",
    text: evt.data.text ?? evt.data.subject ?? "(reply received)",
    providerId: evt.data.email_id ?? evt.data.id ?? `${messageId}:${evt.data.subject}`,
    simulated: false,
  });
  return Response.json({ ok: true, messageId });
}
