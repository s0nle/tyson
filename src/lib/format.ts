import type { Actor, QualificationStatus } from "@/contract";

export const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
export const actorLabel = (a: Actor) => (a.kind === "agent" ? a.name.replace(" agent", "") : a.kind === "rep" ? `Rep · ${a.name}` : a.name);
export const statusTone: Record<QualificationStatus, string> = {
  actionable: "tone-open",
  closed_window: "tone-closed",
  needs_review: "tone-review",
  disqualified: "tone-muted",
};
export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
