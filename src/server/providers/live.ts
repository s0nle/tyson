import OpenAI from "openai";
import { z } from "zod";
import { DraftOutput, IcpInference, NoticeExtraction } from "@/contract";
import type {
  AiProvider,
  BillingProvider,
  CompetitorSummary,
  EnrichProvider,
  MailProvider,
  SearchProvider,
} from "./types";

// ---------------- OpenAI (structured output → re-validated with the contract's Zod schema) ----------------

const CompetitorList = z.object({
  competitors: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      category: z.enum(["direct", "indirect", "alternative"]),
      positioning: z.string(),
      pricing: z.string(),
      differentiators: z.array(z.string()),
      excerpt: z.string(),
    }),
  ),
});

export function openAiProvider(apiKey: string, model: string): AiProvider {
  const client = new OpenAI({ apiKey });
  async function structured<S extends z.ZodType>(name: string, schema: S, system: string, user: string): Promise<z.output<S>> {
    const res = await client.chat.completions.create({
      model,
      ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: (process.env.OPENAI_REASONING as "low" | "minimal" | "medium") || "low" } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name, schema: z.toJSONSchema(schema) as Record<string, unknown>, strict: false },
      },
    });
    const text = res.choices[0]?.message?.content ?? "{}";
    return schema.parse(JSON.parse(text)) as z.output<S>;
  }

  return {
    kind: "live",
    inferIcp: ({ companyName, description }) =>
      structured(
        "icp_inference",
        IcpInference,
        `You infer an ideal customer profile for a B2B specialty supplier that sells to contractors bidding public works.
The buyer is a contractor's estimator or purchasing lead, NOT the utility. Return every ICP key exactly once:
industries, naics, company_size, buyer_roles, buying_signals, regions, exclusions. Confidence 0-1 reflects how directly
the description supports the field; when something is not stated keep values short and confidence <= 0.5.
Never invent certifications the supplier did not state (leave certifications empty if none).
Suggest 2-3 adjacent segments with concrete evidence-based reasoning. quotePrepDays: realistic days to prepare a quote (default 3).`,
        `Company: ${companyName || "(not given)"}\nDescription: ${description}`,
      ),
    extractNotice: ({ url, title, text, retrievedAt }) =>
      structured(
        "notice_extraction",
        NoticeExtraction,
        `Extract a contractor's request for supplier/subcontractor quotes from a public notice.
Rules: isSupplierSolicitation=true only if a named contractor asks subs/suppliers for quotes.
Keep the OWNER's bid opening separate from the contractor's supplier deadline. For "N hours prior to bid" use
rule=hours_before_bid with hoursBeforeBid=N. Dates as ISO-8601 with offset in the project's local zone (Pacific = -08:00 in winter).
scopes = requested trades/equipment verbatim. scopeExcerpt must be copied verbatim from the text.
A named person and a shared mailbox (bids@, estimating@) are separate contacts. Do not invent emails.
Retrieved at ${retrievedAt}.`,
        `URL: ${url}\nTitle: ${title}\n\n${text.slice(0, 12000)}`,
      ),
    draft: (ctx) =>
      structured(
        "draft",
        DraftOutput,
        `Write a short first-touch ${ctx.channel === "email" ? "email (<= 110 words)" : "LinkedIn connection note (<= 280 characters)"} from a specialty supplier to a contractor's estimating contact.
The single ask is: share the applicable electrical drawings and retrofit specifications so the supplier can determine what it can quote.
Ground every claim in the given scopes and the contractor's own request; never mention pricing, delivery promises or the utility's budget.
Value proposition to lead with (paraphrase it; never paste it or its label verbatim): ${ctx.valueProp}. The utility owns the project; the contractor is bidding it and asking suppliers for quotes — never say the contractor posted or owns the project. Persona rules (follow exactly): ${ctx.persona}.
Weave in this trigger signal naturally: ${ctx.trigger}.${ctx.followUp ? " This is a short follow-up to an earlier email; reference it in one clause and keep it under 70 words." : ""}
Plain text, no markdown, sign off with the supplier name.`,
        JSON.stringify(ctx),
      ),
    async summarizeCompetitors({ capabilities, pages }) {
      if (pages.length === 0) return [];
      const out = await structured(
        "competitors",
        CompetitorList,
        `From these web pages, list businesses that offer the same services as the supplier (potential competitors).
Use only facts present in the pages; excerpt must be copied verbatim from the page. pricing: quote public pricing if present, else "Not published".
category: direct (same service, same region), indirect (overlapping service), alternative (different approach, e.g. OEM service).`,
        `Supplier capabilities: ${capabilities.join("; ")}\n\n${pages.map((p) => `URL: ${p.url}\nTITLE: ${p.title}\n${p.text.slice(0, 2500)}`).join("\n---\n")}`,
      );
      return out.competitors as CompetitorSummary[];
    },
  };
}

// ---------------- Tavily search ----------------

export function tavilySearch(apiKey: string): SearchProvider {
  return {
    kind: "live",
    async search(query, maxResults = 5) {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, max_results: maxResults, search_depth: "advanced", include_raw_content: true }),
      });
      if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { results?: { url: string; title: string; content: string; raw_content?: string | null }[] };
      return (json.results ?? []).map((r) => ({ url: r.url, title: r.title, content: r.raw_content || r.content }));
    },
  };
}

// ---------------- Hunter email verifier ----------------

export function hunterEnrich(apiKey: string): EnrichProvider {
  const p: EnrichProvider = {
    kind: "live",
    calls: 0,
    async verifyEmail(email) {
      p.calls++;
      const res = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`);
      if (!res.ok) return { status: "unknown", score: null, note: `Hunter HTTP ${res.status}` };
      const json = (await res.json()) as { data?: { status?: string; result?: string; score?: number; mx_records?: boolean; webmail?: boolean } };
      const d = json.data ?? {};
      const status = d.status === "valid" || (d.status === "webmail" && d.result === "deliverable") ? "valid"
        : d.status === "accept_all" ? "accept_all" : d.status === "invalid" ? "invalid" : "unknown";
      return { status, score: d.score ?? null, note: `Hunter: status=${d.status}, result=${d.result}, mx=${d.mx_records}` };
    },
    async findCompany(domain) {
      const res = await fetch(`https://api.hunter.io/v2/companies/find?domain=${encodeURIComponent(domain)}&api_key=${apiKey}`);
      const none = { found: false, legalName: null, headquarters: null, industry: null, naics: null, employees: null, linkedinUrl: null };
      if (!res.ok) return none;
      const d = ((await res.json()) as { data?: Record<string, any> }).data;
      if (!d) return none;
      return {
        found: true,
        legalName: d.legalName ?? d.name ?? null,
        headquarters: d.location ?? null,
        industry: d.category?.industry ?? null,
        naics: d.category?.naicsCode ?? null,
        employees: d.metrics?.employees ?? null,
        linkedinUrl: d.linkedin?.handle ? `https://www.linkedin.com/${d.linkedin.handle}` : null,
      };
    },
    async findPerson(email) {
      const res = await fetch(`https://api.hunter.io/v2/people/find?email=${encodeURIComponent(email)}&api_key=${apiKey}`);
      if (!res.ok) return { linkedinUrl: null };
      const d = ((await res.json()) as { data?: Record<string, any> }).data;
      return { linkedinUrl: d?.linkedin?.handle ? `https://www.linkedin.com/in/${d.linkedin.handle}` : null };
    },
  };
  return p;
}

// ---------------- Resend ----------------

export function resendMail(apiKey: string, from: string): MailProvider {
  const p: MailProvider = {
    kind: "live",
    calls: 0,
    async send({ to, subject, text, replyTo, tag }) {
      p.calls++;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "idempotency-key": tag },
        body: JSON.stringify({ from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}), tags: [{ name: "message", value: tag.replace(/[^a-zA-Z0-9_-]/g, "_") }] }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { id: string };
      return { providerMessageId: json.id };
    },
  };
  return p;
}

// ---------------- Flexprice ----------------

export function flexpriceBilling(apiKey: string, baseUrl: string): BillingProvider {
  const base = baseUrl.replace(/\/$/, "");
  const h = { "content-type": "application/json", "x-api-key": apiKey };
  const ext = (orgId: string) => `org_${orgId}`;
  return {
    kind: "live",
    customerExternalId: ext,
    async ensureCustomer(orgId, name) {
      const res = await fetch(`${base}/customers/external/${ext(orgId)}`, { headers: h, signal: AbortSignal.timeout(8000) });
      if (res.ok) return;
      await fetch(`${base}/customers`, { method: "POST", headers: h, body: JSON.stringify({ external_id: ext(orgId), name }), signal: AbortSignal.timeout(8000) });
    },
    async ingest(e) {
      const res = await fetch(`${base}/events`, {
        method: "POST",
        headers: h,
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          event_id: e.id,
          event_name: e.eventName,
          external_customer_id: ext(e.orgId),
          timestamp: e.at,
          properties: { lead_id: e.leadId ?? "", run_id: e.runId ?? "", operation: e.eventName },
        }),
      });
      return res.ok;
    },
    async walletBalance(orgId) {
      const c = await fetch(`${base}/customers/external/${ext(orgId)}`, { headers: h, signal: AbortSignal.timeout(8000) });
      if (!c.ok) return null;
      const cust = (await c.json()) as { id?: string };
      if (!cust.id) return null;
      const w = await fetch(`${base}/customers/${cust.id}/wallets`, { headers: h, signal: AbortSignal.timeout(8000) });
      if (!w.ok) return null;
      const wallets = (await w.json()) as { id: string }[] | { items?: { id: string }[] };
      const first = Array.isArray(wallets) ? wallets[0] : wallets.items?.[0];
      if (!first) return null;
      const b = await fetch(`${base}/wallets/${first.id}/balance/real-time`, { headers: h, signal: AbortSignal.timeout(8000) });
      if (!b.ok) return null;
      const bal = (await b.json()) as { real_time_credit_balance?: number | string; credit_balance?: number | string };
      const v = Number(bal.real_time_credit_balance ?? bal.credit_balance);
      return Number.isFinite(v) ? v : null;
    },
  };
}
