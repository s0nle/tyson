/**
 * Approval binds to the exact revision, channel, recipient and copy. The client computes the hash of
 * what the rep is looking at; the server recomputes it and refuses a mismatch. Changing any field → new hash.
 */
export function approvalHash(m: { revision: number; channel: string; recipient: string; subject: string; body: string }): string {
  return cyrb53([m.revision, m.channel, m.recipient.trim().toLowerCase(), m.subject, m.body].join("␟"));
}

/** Small deterministic 53-bit string hash (no crypto dependency, identical in browser and server). */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Credit prices per metered event (integers). Charges are taken only on success. */
export const PRICES = { graph_query_evaluated: 1, lead_enriched: 3, outreach_sent: 1 } as const;
export const STARTING_CREDITS = 6;

export const STAGE_ORDER = ["matched", "contacted", "replied", "meeting_booked", "closed_won", "closed_lost"] as const;
export const STAGE_LABEL: Record<(typeof STAGE_ORDER)[number], string> = {
  matched: "Matched",
  contacted: "Contacted",
  replied: "Replied",
  meeting_booked: "Meeting booked",
  closed_won: "Closed won",
  closed_lost: "Closed lost",
};
