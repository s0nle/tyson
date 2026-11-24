import { z } from "zod";
import { LedgerResponse } from "./activity";
import { Me } from "./common";
import { ApiErrorBody, ContractError } from "./errors";
import {
  Analytics,
  AnalyticsQuery,
  AgentNoteRequest,
  GeoSearchQuery,
  GeoSearchResponse,
  LeadSummary,
  RefreshRequest,
  RefreshResponse,
  EvaluateLeadRequest,
  GraphView,
  LeadDetail,
  ListCompetitorsResponse,
  ListLeadsQuery,
  ListLeadsResponse,
  MoveLeadRequest,
  Pipeline,
  VerifyContactRequest,
} from "./leads";
import {
  DecideMessageRequest,
  DraftRequest,
  SequenceRequest,
  SequenceResponse,
  Message,
  ReviseMessageRequest,
  SendMessageRequest,
  SimulateReplyRequest,
} from "./messages";
import { InferProfileRequest, ProfileResponse, SupplierProfile, UpdateProfileRequest } from "./profile";
import { ListRunsResponse, Run, StartRunRequest } from "./runs";

type Method = "GET" | "POST";
type Schema = z.ZodType;

export interface Endpoint<
  P extends string = string,
  Q extends Schema | undefined = Schema | undefined,
  B extends Schema | undefined = Schema | undefined,
  R extends Schema = Schema,
> {
  method: Method;
  path: P;
  query: Q;
  body: B;
  response: R;
}

function endpoint<
  const P extends string,
  R extends Schema,
  Q extends Schema | undefined = undefined,
  B extends Schema | undefined = undefined,
>(e: { method: Method; path: P; response: R; query?: Q; body?: B }): Endpoint<P, Q, B, R> {
  return { method: e.method, path: e.path, response: e.response, query: e.query as Q, body: e.body as B };
}

const Empty = z.object({}).default({});

export const endpoints = {
  getMe: endpoint({ method: "GET", path: "/api/v1/me", response: Me }),
  resetDemo: endpoint({ method: "POST", path: "/api/v1/demo/reset", body: Empty, response: Me }),

  getProfile: endpoint({ method: "GET", path: "/api/v1/profile", response: ProfileResponse }),
  inferProfile: endpoint({ method: "POST", path: "/api/v1/profile/infer", body: InferProfileRequest, response: SupplierProfile }),
  updateProfile: endpoint({ method: "POST", path: "/api/v1/profile", body: UpdateProfileRequest, response: SupplierProfile }),
  approveProfile: endpoint({ method: "POST", path: "/api/v1/profile/approve", body: Empty, response: SupplierProfile }),

  startRun: endpoint({ method: "POST", path: "/api/v1/runs", body: StartRunRequest, response: Run }),
  listRuns: endpoint({ method: "GET", path: "/api/v1/runs", response: ListRunsResponse }),
  getRun: endpoint({ method: "GET", path: "/api/v1/runs/:runId", response: Run }),

  listLeads: endpoint({ method: "GET", path: "/api/v1/leads", query: ListLeadsQuery, response: ListLeadsResponse }),
  getLead: endpoint({ method: "GET", path: "/api/v1/leads/:leadId", response: LeadDetail }),
  evaluateLead: endpoint({ method: "POST", path: "/api/v1/leads/:leadId/evaluate", body: EvaluateLeadRequest, response: LeadDetail }),
  verifyContact: endpoint({
    method: "POST",
    path: "/api/v1/leads/:leadId/contacts/:contactId/verify",
    body: VerifyContactRequest,
    response: LeadDetail,
  }),
  moveLead: endpoint({ method: "POST", path: "/api/v1/leads/:leadId/stage", body: MoveLeadRequest, response: LeadDetail }),
  agentNote: endpoint({ method: "POST", path: "/api/v1/leads/:leadId/agent-notes", body: AgentNoteRequest, response: LeadDetail }),
  refreshLeads: endpoint({ method: "POST", path: "/api/v1/leads/refresh", body: RefreshRequest, response: RefreshResponse }),
  enrichCompany: endpoint({ method: "POST", path: "/api/v1/leads/:leadId/enrich-company", body: z.object({}).default({}), response: LeadDetail }),
  draftSequence: endpoint({ method: "POST", path: "/api/v1/leads/:leadId/sequence", body: SequenceRequest, response: SequenceResponse }),
  geoSearch: endpoint({ method: "GET", path: "/api/v1/geo/search", query: GeoSearchQuery, response: GeoSearchResponse }),
  getQueue: endpoint({
    method: "GET",
    path: "/api/v1/queue",
    response: z.object({ items: z.array(z.object({ message: Message, lead: LeadSummary })) }),
  }),
  draftMessage: endpoint({ method: "POST", path: "/api/v1/leads/:leadId/drafts", body: DraftRequest, response: Message }),

  reviseMessage: endpoint({ method: "POST", path: "/api/v1/messages/:messageId/revise", body: ReviseMessageRequest, response: Message }),
  decideMessage: endpoint({ method: "POST", path: "/api/v1/messages/:messageId/decision", body: DecideMessageRequest, response: Message }),
  sendMessage: endpoint({ method: "POST", path: "/api/v1/messages/:messageId/send", body: SendMessageRequest, response: Message }),
  simulateReply: endpoint({ method: "POST", path: "/api/v1/messages/:messageId/simulate-reply", body: SimulateReplyRequest, response: Message }),

  getPipeline: endpoint({ method: "GET", path: "/api/v1/pipeline", response: Pipeline }),
  getAnalytics: endpoint({ method: "GET", path: "/api/v1/analytics", query: AnalyticsQuery, response: Analytics }),
  getLedger: endpoint({ method: "GET", path: "/api/v1/billing/ledger", response: LedgerResponse }),
  listCompetitors: endpoint({ method: "GET", path: "/api/v1/competitors", response: ListCompetitorsResponse }),
  getGraph: endpoint({ method: "GET", path: "/api/v1/graph", response: GraphView }),
} as const;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;
export type ResponseOf<K extends EndpointName> = z.output<Endpoints[K]["response"]>;

type PathParam<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | PathParam<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

type ParamsArg<P extends string> = [PathParam<P>] extends [never] ? { params?: undefined } : { params: Record<PathParam<P>, string> };
type BodyArg<B> = B extends Schema ? { body: z.input<B> } : { body?: undefined };
type QueryArg<Q> = Q extends Schema ? { query?: z.input<Q> } : { query?: undefined };
type Common = { headers?: Record<string, string>; signal?: AbortSignal };

export type CallArgs<E extends Endpoint> = ParamsArg<E["path"]> & BodyArg<E["body"]> & QueryArg<E["query"]> & Common;

type IsOptional<E extends Endpoint> = [PathParam<E["path"]>] extends [never]
  ? E["body"] extends Schema
    ? undefined extends z.input<E["body"]>
      ? true
      : false
    : true
  : false;

type ArgsTuple<E extends Endpoint> = IsOptional<E> extends true ? [args?: CallArgs<E>] : [args: CallArgs<E>];

export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined) throw new ContractError("bad_request", `Missing path param ${name}`);
    return encodeURIComponent(v);
  });
}

export interface ClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

export function createClient(opts: ClientOptions) {
  const doFetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  return async function call<K extends EndpointName>(name: K, ...rest: ArgsTuple<Endpoints[K]>): Promise<ResponseOf<K>> {
    const e = endpoints[name] as Endpoint;
    const args = (rest[0] ?? {}) as { params?: Record<string, string>; body?: unknown; query?: unknown } & Common;
    let url = opts.baseUrl.replace(/\/$/, "") + buildPath(e.path, args.params);
    if (e.query && args.query !== undefined) {
      const q = e.query.parse(args.query) as Record<string, unknown>;
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null) sp.set(k, String(v));
      const s = sp.toString();
      if (s) url += `?${s}`;
    }
    let body: string | undefined;
    if (e.body) {
      const parsed = e.body.safeParse(args.body);
      if (!parsed.success) {
        throw new ContractError("bad_request", parsed.error.issues[0]?.message ?? "Invalid request", 400, parsed.error.issues);
      }
      body = JSON.stringify(parsed.data);
    }
    const headers: Record<string, string> = {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.headers ? await opts.headers() : {}),
      ...args.headers,
    };
    const res = await doFetch(url, { method: e.method, headers, body, signal: args.signal });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const err = ApiErrorBody.safeParse(json);
      if (err.success) throw new ContractError(err.data.error.code, err.data.error.message, res.status, err.data.error.details);
      throw new ContractError("internal", `HTTP ${res.status} from ${e.method} ${e.path}`, res.status);
    }
    return e.response.parse(json) as ResponseOf<K>;
  };
}

export type Client = ReturnType<typeof createClient>;
