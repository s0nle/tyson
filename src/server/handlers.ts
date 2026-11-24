import { ContractError } from "@/contract";
import type { Handlers } from "./http";
import { analytics } from "./services/analytics";
import { ledger, meFor, resetOrg, totals } from "./services/base";
import { getRun, listCompetitors, listRuns, startRun } from "./services/discovery";
import { wholeGraph } from "./services/graph";
import { agentNote, allLeads, evaluateLead, leadDetail, moveLead, pipeline, toSummary, verifyContact } from "./services/leads";
import { decideMessage, draftMessage, recordReply, reviseMessage, sendMessage } from "./services/messages";
import { approveProfile, getProfile, inferProfile, updateProfile } from "./services/profile";

const p = (params: Record<string, string>, k: string) => {
  const v = params[k];
  if (!v) throw new ContractError("bad_request", `Missing ${k}`);
  return v;
};

export const handlers: Handlers = {
  async getMe({ deps, org }) {
    return meFor(deps, await org());
  },
  async resetDemo({ deps, org }) {
    const o = await org();
    await resetOrg(deps, o);
    return meFor(deps, o);
  },
  async getProfile({ deps, org }) {
    return { profile: await getProfile(deps, await org()) };
  },
  async inferProfile({ deps, org, body }) {
    return inferProfile(deps, await org(), body);
  },
  async updateProfile({ deps, org, body }) {
    return updateProfile(deps, await org(), body);
  },
  async approveProfile({ deps, org }) {
    return approveProfile(deps, await org());
  },
  async startRun({ deps, org, body }) {
    return startRun(deps, await org(), body);
  },
  async listRuns({ deps, org }) {
    return listRuns(deps, await org());
  },
  async getRun({ deps, org, params }) {
    return getRun(deps, await org(), p(params, "runId"));
  },
  async listLeads({ deps, org, query }) {
    let leads = await allLeads(deps, await org());
    if (query.status) leads = leads.filter((l) => l.qualification.status === query.status);
    if (query.stage) leads = leads.filter((l) => l.stage === query.stage);
    if (query.tier) leads = leads.filter((l) => l.score.tier === query.tier);
    if (query.segment) leads = leads.filter((l) => l.segment === query.segment);
    return { asOf: new Date(deps.now()).toISOString(), leads: leads.map(toSummary) };
  },
  async getLead({ deps, org, params }) {
    return leadDetail(deps, await org(), p(params, "leadId"));
  },
  async evaluateLead({ deps, org, params, body }) {
    return evaluateLead(deps, await org(), p(params, "leadId"), body);
  },
  async verifyContact({ deps, org, params, body }) {
    return verifyContact(deps, await org(), p(params, "leadId"), p(params, "contactId"), body);
  },
  async moveLead({ deps, org, params, body }) {
    return moveLead(deps, await org(), p(params, "leadId"), body);
  },
  async agentNote({ deps, org, params, body }) {
    return agentNote(deps, await org(), p(params, "leadId"), body);
  },
  async draftMessage({ deps, org, params, body }) {
    return draftMessage(deps, await org(), p(params, "leadId"), body);
  },
  async reviseMessage({ deps, org, params, body }) {
    return reviseMessage(deps, await org(), p(params, "messageId"), body);
  },
  async decideMessage({ deps, org, params, body }) {
    return decideMessage(deps, await org(), p(params, "messageId"), body);
  },
  async sendMessage({ deps, org, params, body }) {
    return sendMessage(deps, await org(), p(params, "messageId"), body);
  },
  async simulateReply({ deps, org, params, body }) {
    const o = await org();
    return recordReply(deps, o, p(params, "messageId"), { from: "Test inbox (simulated contractor)", text: body.body, providerId: `sim_${p(params, "messageId")}`, simulated: true });
  },
  async getPipeline({ deps, org }) {
    return pipeline(deps, await org());
  },
  async getAnalytics({ deps, org, query }) {
    return analytics(deps, await org(), query);
  },
  async getLedger({ deps, org }) {
    const o = await org();
    const entries = await ledger(deps.db, o);
    const t = totals(entries);
    return {
      ...t,
      entries,
      flexprice: {
        mode: deps.billing.kind,
        customerExternalId: deps.billing.customerExternalId(o.id),
        walletBalance: deps.billing.kind === "live" ? await deps.billing.walletBalance(o.id).catch(() => null) : null,
      },
    };
  },
  async listCompetitors({ deps, org }) {
    return listCompetitors(deps, await org());
  },
  async getGraph({ deps, org }) {
    return wholeGraph(deps.db, await org());
  },
};
