"use client";
import { useEffect, useState } from "react";
import type { Run, RunStep } from "@/contract";
import { Icon } from "./ui";

export function ProgressBar({
  value,
  label,
  caption,
}: {
  value?: number;
  label: string;
  caption?: string;
}) {
  const progress =
    value === undefined
      ? undefined
      : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="task-progress">
      <div className="progress-label">
        <span>{label}</span>
        {progress !== undefined && <strong>{progress}%</strong>}
      </div>
      <div
        className={`progress-track ${progress === undefined ? "indeterminate" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span
          style={progress === undefined ? undefined : { width: `${progress}%` }}
        />
      </div>
      {caption && <p className="progress-caption">{caption}</p>}
    </div>
  );
}
const PHASES: Record<RunStep["kind"], { percent: number; text: string }> = {
  plan: { percent: 10, text: "Planning your search" },
  search: { percent: 25, text: "Finding contractor requests" },
  retrieve: { percent: 40, text: "Reading public notices" },
  extract: { percent: 55, text: "Identifying buying signals" },
  graph: { percent: 65, text: "Connecting evidence" },
  match: { percent: 75, text: "Matching your services" },
  review: { percent: 85, text: "Checking fit and deadlines" },
  security: { percent: 95, text: "Validating the results" },
  done: { percent: 100, text: "Results are ready" },
  error: { percent: 0, text: "Search interrupted" },
};
export function DiscoveryProgress({ run }: { run: Run }) {
  const last = run.steps.at(-1);
  const value =
    run.status === "done"
      ? 100
      : Math.min(
          95,
          Math.max(
            0,
            ...run.steps
              .filter((s) => s.kind !== "done")
              .map((s) => PHASES[s.kind].percent),
          ),
        );
  const role = last?.actor.role;
  const agent = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Planner";
  const text =
    run.status === "done"
      ? `${run.counts.actionable} ready to pursue`
      : run.status === "failed"
        ? "Search interrupted"
        : last
          ? PHASES[last.kind].text
          : "Getting ready to search";
  return (
    <section
      className={`discovery-progress ${run.status === "done" ? "complete" : ""}`}
      aria-live="polite"
    >
      <div className="discovery-agent">
        <span className="agent-icon">
          <Icon name={run.status === "done" ? "check" : "spark"} size={18} />
        </span>
        <div>
          <strong>
            {run.status === "done"
              ? "Discovery complete"
              : run.status === "failed"
                ? "Discovery paused"
                : `${agent} agent`}
          </strong>
          <p>{text}</p>
        </div>
      </div>
      <ProgressBar
        label={run.status === "done" ? "Complete" : "Discovery progress"}
        value={value}
      />
    </section>
  );
}
/** The draft endpoint has no incremental telemetry; keep the estimate below 100 until it returns. */
export function useDraftProgress(busy: boolean, completed: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setValue(8);
    const timer = setInterval(
      () =>
        setValue((v) =>
          Math.min(92, v + Math.max(1, Math.round((94 - v) / 7))),
        ),
      700,
    );
    return () => clearInterval(timer);
  }, [busy]);
  return completed && !busy ? 100 : value;
}
