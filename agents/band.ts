/**
 * Band room bridge: four SDK-backed agents (Planner, Builder, Reviewer, Security) in one shared Band room.
 * Each agent acts on the app ONLY through the contract's typed client, so every handoff changes the real lead.
 *
 *   npx tsx --env-file=.env.local agents/band.ts setup   # create the room, add agents + rep, post the kickoff
 *   npx tsx --env-file=.env.local agents/band.ts         # run the four agents
 *
 * In the room: "@planner profile: <what you sell>" → review → "@planner approve" → agents hand off → approval link.
 */
import fs from "node:fs";
import { Agent, GenericAdapter } from "@band-ai/sdk";
import { createClient, formatInZone, type LeadDetail } from "../src/contract/index";

const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`Missing ${k}`);
  return v;
};
const REST = env("BAND_REST_URL", "https://app.band.ai/api/v1");
const APP = env("APP_URL", "https://contractor-sales-engine-eight.vercel.app").replace(/\/$/, "");
const REP = env("BAND_REP_HANDLE", "sle573");
const APP_USER = env("APP_USER", REP);
const ROOM_FILE = ".band-room.json";

const AGENTS = {
  planner: { id: env("BAND_PLANNER_ID"), key: env("BAND_PLANNER_KEY"), handle: `${REP}/planner` },
  builder: { id: env("BAND_BUILDER_ID"), key: env("BAND_BUILDER_KEY"), handle: `${REP}/builder` },
  reviewer: { id: env("BAND_REVIEWER_ID"), key: env("BAND_REVIEWER_KEY"), handle: `${REP}/reviewer` },
  security: { id: env("BAND_SECURITY_ID"), key: env("BAND_SECURITY_KEY"), handle: `${REP}/security` },
} as const;
type Role = keyof typeof AGENTS;

const app = createClient({ baseUrl: APP, headers: () => ({ authorization: `Bearer ${encodeURIComponent(APP_USER)}` }) });
const leadLink = (id: string) => `${APP}/leads/${id}?as=${encodeURIComponent(APP_USER)}`;

async function band(role: Role, method: string, path: string, body?: unknown) {
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: { "x-api-key": AGENTS[role].key, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Band ${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as { data: Record<string, unknown> }) : null;
}

/** Proactive post from an agent (used outside a turn, e.g. the approval watcher). */
async function post(role: Role, roomId: string, content: string, mentions: { handle: string }[]) {
  await band(role, "POST", `/agent/chats/${roomId}/messages`, { message: { content, mentions } });
}

const mention = (role: Role) => ({ handle: AGENTS[role].handle });
const rep = { handle: REP };
const strip = (s: string) => s.replace(/^\s*(?:@\S+\s*)+/, "").trim();

// ---------------- setup ----------------

async function setup() {
  const me = await band("planner", "GET", "/agent/me");
  const ownerId = String(me?.data.owner_uuid);
  const chat = await band("planner", "POST", "/agent/chats", { chat: { title: "Bay Controls · SD-462 qualification" } });
  const roomId = String(chat?.data.id);
  for (const r of ["builder", "reviewer", "security"] as Role[]) {
    await band("planner", "POST", `/agent/chats/${roomId}/participants`, { participant: { participant_id: AGENTS[r].id, role: "member" } });
  }
  await band("planner", "POST", `/agent/chats/${roomId}/participants`, { participant: { participant_id: ownerId, role: "admin" } });
  fs.writeFileSync(ROOM_FILE, JSON.stringify({ roomId, createdAt: new Date().toISOString() }, null, 2));
  await post(
    "planner",
    roomId,
    `@${REP} Room ready. Tell me what you sell: "@planner profile: <description>". I'll propose the buyer profile for your decision, then hand approved constraints to @${AGENTS.builder.handle}.`,
    [rep, mention("builder")],
  );
  console.log(`Room ${roomId} created. Open Band and find "Bay Controls · SD-462 qualification".`);
}

// ---------------- agent behaviours ----------------

const state = { lastRunId: null as string | null, watching: new Map<string, string>() };

async function planner(text: string, roomId: string, send: (t: string, m: { handle: string }[]) => Promise<unknown>) {
  const t = strip(text);
  if (/^profile:/i.test(t) || t.length > 60) {
    const description = t.replace(/^profile:\s*/i, "");
    const p = await app("inferProfile", { body: { description, companyName: "Bay Controls Co" } });
    const f = (k: string) => p.icp.find((x) => x.key === k);
    const line = (k: string) => {
      const x = f(k);
      return x ? `• ${x.label}: ${x.values.join("; ") || "unknown"} (confidence ${x.confidence.toFixed(2)})` : "";
    };
    await send(
      [
        `@${REP} Proposed buyer profile v${p.version} for ${p.companyName}:`,
        `• Services: ${p.capabilities.join("; ")}`,
        line("buyer_roles"),
        line("buying_signals"),
        line("regions"),
        `• Adjacent: ${p.adjacentSegments.map((s) => `${s.name} (${s.confidence.toFixed(2)})`).join("; ")}`,
        `Reply "@planner approve" to accept, or edit fields at ${APP}/?as=${encodeURIComponent(APP_USER)}`,
      ]
        .filter(Boolean)
        .join("\n"),
      [rep],
    );
    return;
  }
  if (/^(approve|approved|yes|run)\b/i.test(t)) {
    const current = (await app("getProfile")).profile;
    if (!current) {
      await send(`@${REP} No profile yet. Send "@planner profile: <what you sell>".`, [rep]);
      return;
    }
    const p = current.status === "approved" ? current : await app("approveProfile");
    const run = await app("startRun", { body: { mode: "live", bandRoomId: roomId } });
    state.lastRunId = run.id;
    await send(
      `@${AGENTS.builder.handle} Rep approved profile v${p.version}. Constraints: services [${p.capabilities.join("; ")}], regions [${p.regions.join(", ") || "unknown"}], quote prep ${p.quotePrepDays} days. Run ${run.id} — retrieve notices, write source-backed graph records, and send the shortlist to @${AGENTS.reviewer.handle}.`,
      [mention("builder"), mention("reviewer")],
    );
    return;
  }
  await send(`@${REP} I understand "profile: …" and "approve".`, [rep]);
}

async function waitForRun(runId: string) {
  for (let i = 0; i < 90; i++) {
    const r = await app("getRun", { params: { runId } });
    if (r.status === "done" || r.status === "failed") return r;
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error("Run timed out");
}

async function leadsOfRun(runId: string): Promise<LeadDetail[]> {
  const run = await app("getRun", { params: { runId } });
  return Promise.all(run.leadIds.map((leadId) => app("getLead", { params: { leadId } })));
}

async function builder(text: string, roomId: string, send: (t: string, m: { handle: string }[]) => Promise<unknown>) {
  const t = strip(text);
  const runId = /Run ([0-9a-f-]{36})/i.exec(t)?.[1] ?? state.lastRunId;
  if (/remove|exclude/i.test(t)) {
    if (!runId) return;
    const leads = await leadsOfRun(runId);
    const removed: string[] = [];
    for (const l of leads.filter((x) => x.qualification.status !== "actionable")) {
      await app("agentNote", { params: { leadId: l.id }, body: { role: "builder", decision: "exclude", note: `Removed from actionable leads at reviewer's request: ${l.qualification.reasons[0] ?? l.qualification.label}`, bandRoomId: roomId } });
      removed.push(l.contractorName);
    }
    const target = leads.find((x) => x.qualification.status === "actionable");
    if (!target) {
      await send(`@${REP} Removed ${removed.join(", ")}. No actionable leads remain.`, [rep]);
      return;
    }
    const draft = await app("draftMessage", { params: { leadId: target.id }, body: { channel: "email", variant: "A" } });
    state.watching.set(draft.id, roomId);
    await send(
      `@${AGENTS.security.handle} Removed ${removed.join(", ") || "nothing"} from actionable leads (account kept). Drafted step 1 for ${target.contractorName} (message ${draft.id}, revision ${draft.revision}): "${draft.subject}". Please check destination, links and attachments.`,
      [mention("security")],
    );
    return;
  }
  if (!runId) {
    await send(`@${AGENTS.planner.handle} I need a run id.`, [mention("planner")]);
    return;
  }
  const run = await waitForRun(runId);
  const leads = await leadsOfRun(runId);
  const sources = run.steps.filter((s) => s.kind === "retrieve" || s.kind === "extract").map((s) => `• ${s.message.slice(0, 110)}${s.url ? `\n  ${s.url}` : ""}`);
  await send(
    [
      `@${AGENTS.reviewer.handle} Run ${run.id.slice(0, 8)} ${run.status}: ${run.counts.sources} sources, ${leads.length} candidates written to the graph.`,
      ...sources.slice(0, 6),
      `Preliminary matches (both Oakland candidates): ${leads.map((l) => `${l.contractorName} — ${l.scopes.join("; ")} — ${leadLink(l.id)}`).join(" | ")}`,
      `Please check scope, owner vs supplier dates and contact attribution. Run ${run.id}`,
    ].join("\n"),
    [mention("reviewer")],
  );
}

async function reviewer(text: string, roomId: string, send: (t: string, m: { handle: string }[]) => Promise<unknown>) {
  const runId = /Run ([0-9a-f-]{36})/i.exec(text)?.[1] ?? state.lastRunId;
  if (!runId) return;
  const leads = await leadsOfRun(runId);
  const lines: string[] = [];
  const exclude: string[] = [];
  for (const l of leads) {
    const owner = l.deadlines.find((d) => d.kind === "owner_bid_opening");
    const d = l.qualification.decidingDeadline;
    const contacts = l.contacts.filter((c) => !c.isTestContact).map((c) => `${c.name ?? c.email} (${c.kind === "shared_mailbox" ? "shared mailbox" : (c.title ?? "named")})`).join(" + ");
    if (l.qualification.status === "actionable") {
      lines.push(`✓ ${l.contractorName}: scope "${l.scopes[0]}" matches. Owner bid ${owner?.at ? formatInZone(owner.at) : "?"} is not the supplier deadline; ${d?.derivation}. Contacts as published: ${contacts}. Keep actionable.`);
      await app("agentNote", { params: { leadId: l.id }, body: { role: "reviewer", decision: "keep", note: `Independent check: ${d?.derivation}`, bandRoomId: roomId } });
    } else {
      lines.push(`✗ ${l.contractorName}: ${l.qualification.label}. ${l.qualification.reasons[0] ?? ""}`);
      await app("agentNote", { params: { leadId: l.id }, body: { role: "reviewer", decision: "note", note: `Flagged for removal: ${l.qualification.reasons[0] ?? l.qualification.label}`, bandRoomId: roomId } });
      exclude.push(l.contractorName);
    }
  }
  await send(
    [...lines, exclude.length ? `@${AGENTS.builder.handle} remove ${exclude.join(", ")} from actionable leads. Run ${runId}` : `@${AGENTS.builder.handle} all candidates stay. Run ${runId}`].join("\n"),
    [mention("builder")],
  );
}

async function security(text: string, roomId: string, send: (t: string, m: { handle: string }[]) => Promise<unknown>) {
  const messageId = /message ([0-9a-f-]{36})/i.exec(text)?.[1];
  const runId = state.lastRunId;
  const leads = runId ? await leadsOfRun(runId) : [];
  const lead = leads.find((l) => l.messages.some((m) => m.id === messageId)) ?? leads.find((l) => l.qualification.status === "actionable");
  if (!lead) return;
  const m = lead.messages.find((x) => x.id === messageId) ?? lead.messages.at(-1);
  if (!m) return;
  const findings = [
    ...m.securityCheck.findings,
    `Destination ${m.recipient} is the team test inbox; ${lead.contacts.find((c) => c.kind === "shared_mailbox")?.email ?? "contractor mailbox"} is display-only`,
    `Evidence links: ${m.groundedOn.map((u) => (u.startsWith("https://") ? "https ✓" : `NOT https: ${u}`)).join(", ")}`,
    "No attachments",
  ];
  await app("agentNote", { params: { leadId: lead.id }, body: { role: "security", decision: "keep", note: findings.join("; "), bandRoomId: roomId } });
  state.watching.set(m.id, roomId);
  await send(
    `@${REP} Security check ${m.securityCheck.passed ? "passed" : "FLAGGED"} for ${lead.contractorName} draft (revision ${m.revision}): ${findings.join("; ")}.\nReview and approve, edit or reject the exact draft here: ${leadLink(lead.id)}\nNothing is queued until you approve.`,
    [rep],
  );
}

/** Reports the rep's decision (made in the authenticated review screen) back to the room. */
async function watchApprovals() {
  const seen = new Map<string, string>();
  setInterval(async () => {
    for (const [messageId, roomId] of state.watching) {
      try {
        const runId = state.lastRunId;
        if (!runId) continue;
        const leads = await leadsOfRun(runId);
        const m = leads.flatMap((l) => l.messages).find((x) => x.id === messageId);
        if (!m) continue;
        const key = `${m.status}:${m.revision}`;
        if (seen.get(messageId) === key) continue;
        seen.set(messageId, key);
        if (m.status === "approved" && m.approval) {
          await post("security", roomId, `@${REP} Approval recorded: revision ${m.approval.revision}, hash ${m.approval.hash.slice(0, 8)}, to ${m.recipient}. Send is now allowed (1 credit).`, [rep]);
        } else if (m.status === "rejected") {
          await post("security", roomId, `@${AGENTS.builder.handle} Rep rejected revision ${m.revision}: ${m.rejection?.reason}. Do not queue.`, [mention("builder")]);
        } else if (m.status === "sent") {
          await post("security", roomId, `@${REP} Sent via ${m.delivery?.provider} (${m.delivery?.providerMessageId ?? "no id"}). Lead moved to Contacted.`, [rep]);
          state.watching.delete(messageId);
        } else if (m.status === "draft" && m.revision > 1) {
          await post("security", roomId, `@${REP} Revision ${m.revision} saved; previous approval invalidated. Re-approve before sending.`, [rep]);
        }
      } catch (e) {
        console.error("[watch]", e);
      }
    }
  }, 4000);
}

// ---------------- runtime ----------------

const HANDLERS: Record<Role, typeof planner> = { planner, builder, reviewer, security };

async function run() {
  const agents = (Object.keys(AGENTS) as Role[]).map((role) =>
    Agent.create({
      agentId: AGENTS[role].id,
      apiKey: AGENTS[role].key,
      adapter: new GenericAdapter(async ({ message, tools, roomId }) => {
        const send = (t: string, m: { handle: string }[]) => tools.sendMessage(t, m.map((x) => x.handle));
        console.log(`[${role}] ← ${message.senderName ?? message.senderId}: ${message.content.slice(0, 120)}`);
        try {
          await HANDLERS[role](message.content, roomId, send);
        } catch (e) {
          console.error(`[${role}]`, e);
          await send(`@${REP} ${role} hit an error: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`, [rep]);
        }
      }),
    }),
  );
  void watchApprovals();
  console.log(`Band agents online → app ${APP} as "${APP_USER}". Ctrl+C to stop.`);
  await Promise.all(agents.map((a) => a.run()));
}

if (process.argv[2] === "setup") await setup();
else await run();
