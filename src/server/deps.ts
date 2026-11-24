import type { Db } from "./db";
import { fakeAi, fakeBilling, fakeSearch, makeFakeEnrich, makeFakeMail } from "./providers/fakes";
import { flexpriceBilling, hunterEnrich, openAiProvider, resendMail, tavilySearch } from "./providers/live";
import type { AiProvider, BillingProvider, EnrichProvider, MailProvider, SearchProvider } from "./providers/types";

export interface Config {
  /** Team-controlled inbox that receives every demo send. Never a real prospect. */
  demoInbox: string;
  /** Inbound domain for reply+<messageId>@domain routing (Resend inbound). */
  inboundDomain: string | null;
  /** Max live-search pages extracted per run (keeps runs inside serverless time limits). */
  maxLivePages: number;
}

export interface Deps {
  db: Db;
  now: () => Date;
  log: { error(err: unknown): void; info(msg: string): void };
  ai: AiProvider;
  search: SearchProvider;
  enrich: EnrichProvider;
  mail: MailProvider;
  billing: BillingProvider;
  /** Slow work after responding. Next: after(); tests: awaited (deterministic). */
  afterResponse: (task: () => Promise<void>) => void | Promise<void>;
  config: Config;
}

export const defaultConfig: Config = {
  demoInbox: "demo-inbox@example.com",
  inboundDomain: null,
  maxLivePages: 6,
};

function warn(name: string) {
  console.warn(`[providers] ${name}: no key configured, using deterministic fake`);
}

/** Real provider when its key exists, else the fake. `AI=fake` etc. force fakes. */
export function pickProviders(env: NodeJS.ProcessEnv = process.env) {
  const ai =
    env.AI !== "fake" && env.OPENAI_API_KEY
      ? openAiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL || "gpt-5-mini")
      : (warn("OpenAI"), fakeAi);
  const search = env.SEARCH !== "fake" && env.TAVILY_API_KEY ? tavilySearch(env.TAVILY_API_KEY) : (warn("Tavily"), fakeSearch);
  const enrich = env.ENRICH !== "fake" && env.HUNTER_API_KEY ? hunterEnrich(env.HUNTER_API_KEY) : (warn("Hunter"), makeFakeEnrich());
  const mail =
    env.MAIL !== "fake" && env.RESEND_API_KEY
      ? resendMail(env.RESEND_API_KEY, env.RESEND_FROM || "Tyson Sales Agent <onboarding@resend.dev>")
      : (warn("Resend"), makeFakeMail());
  const billing =
    env.BILLING !== "fake" && env.FLEXPRICE_API_KEY
      ? flexpriceBilling(env.FLEXPRICE_API_KEY, env.FLEXPRICE_BASE_URL || "https://us.api.flexprice.io/v1")
      : (warn("Flexprice"), fakeBilling);
  return { ai, search, enrich, mail, billing };
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    demoInbox: env.DEMO_INBOX || defaultConfig.demoInbox,
    inboundDomain: env.INBOUND_DOMAIN || null,
    maxLivePages: Number(env.MAX_LIVE_PAGES || defaultConfig.maxLivePages),
  };
}
