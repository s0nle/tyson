import type { DraftOutput, IcpInference, NoticeExtraction } from "@/contract";

export interface DraftContext {
  supplierName: string;
  capabilities: string[];
  pastWins: string;
  contractorName: string;
  projectTitle: string;
  ownerName: string;
  recipientName: string | null;
  recipientTitle: string | null;
  matchedScopes: string[];
  responseMethod: string;
  cutoffText: string;
  variant: "A" | "B";
  channel: "email" | "linkedin";
  step: number;
}

export interface CompetitorSummary {
  name: string;
  url: string;
  category: "direct" | "indirect" | "alternative";
  positioning: string;
  pricing: string;
  differentiators: string[];
  excerpt: string;
}

export interface AiProvider {
  kind: "live" | "fake";
  inferIcp(input: { companyName: string; description: string }): Promise<IcpInference>;
  extractNotice(input: { url: string; title: string; text: string; retrievedAt: string }): Promise<NoticeExtraction>;
  draft(ctx: DraftContext): Promise<DraftOutput>;
  summarizeCompetitors(input: { capabilities: string[]; pages: { url: string; title: string; text: string }[] }): Promise<CompetitorSummary[]>;
}

export interface SearchResult {
  url: string;
  title: string;
  content: string;
}
export interface SearchProvider {
  kind: "live" | "fake";
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}

export type VerifyStatus = "valid" | "accept_all" | "unknown" | "invalid";
export interface EnrichProvider {
  kind: "live" | "fake";
  /** Number of provider calls made (lets tests prove a blocked lookup made zero calls). */
  calls: number;
  verifyEmail(email: string): Promise<{ status: VerifyStatus; score: number | null; note: string }>;
}

export interface MailProvider {
  kind: "live" | "fake";
  calls: number;
  send(input: { to: string; subject: string; text: string; replyTo: string | null; tag: string }): Promise<{ providerMessageId: string }>;
}

export interface BillingProvider {
  kind: "live" | "fake";
  customerExternalId(orgId: string): string;
  ensureCustomer(orgId: string, name: string): Promise<void>;
  ingest(event: { id: string; orgId: string; eventName: string; leadId: string | null; runId: string | null; at: string }): Promise<boolean>;
  walletBalance(orgId: string): Promise<number | null>;
}
