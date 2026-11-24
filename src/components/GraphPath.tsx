"use client";
import type { GraphView } from "@/contract";

const ORDER = ["Product", "Scope", "Notice", "Company", "Person", "Message", "Deadline", "Project", "Signal"] as const;
const TONE: Record<string, string> = {
  Product: "border-spec text-spec",
  Message: "border-agent text-agent",
  Scope: "border-spec text-ink",
  Notice: "border-ink-3",
  Company: "border-ink",
  Person: "border-open text-open",
  Deadline: "border-redline text-redline",
  Project: "border-ink-3",
  Signal: "border-review text-review",
};

/** Lead subgraph laid out by node label: service → scope → notice → contractor → people/deadlines → project. */
export function GraphPath({ g }: { g: GraphView }) {
  const by = new Map<string, GraphView["nodes"]>();
  for (const n of g.nodes) by.set(n.label, [...(by.get(n.label) ?? []), n]);
  const rels = [...new Set(g.edges.map((e) => e.rel))];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-2 gap-y-3 items-start">
        {ORDER.filter((l) => by.has(l)).map((label, i) => (
          <div key={label} className="flex items-start gap-2">
            {i > 0 && <span className="text-ink-3 mt-5" aria-hidden>›</span>}
            <div className="space-y-1">
              <div className="text-xs text-ink-3">{label}</div>
              {(by.get(label) ?? []).slice(0, 4).map((n) => (
                <div key={n.id} className={`border-l-2 pl-2 text-xs max-w-[180px] ${TONE[label] ?? ""}`} title={n.name}>
                  {n.name.length > 60 ? `${n.name.slice(0, 58)}…` : n.name}
                  {label === "Company" && typeof n.props.role === "string" && <span className="text-ink-3"> ({n.props.role})</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-3">Edges: {rels.join(", ")} · {g.nodes.length} nodes, {g.edges.length} relationships</p>
    </div>
  );
}
