"use client";
import { useEffect, useState } from "react";
import { api, getUser, refreshAll, setUser } from "@/lib/api";
import { useUser } from "@/lib/hooks";
import { Brand, Icon } from "./ui";
import { ProgressBar } from "./Progress";

export function Shell({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const [ready, setReady] = useState(false);
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [onboarding, setOnboarding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem("cse.intake") || "null");
      if (draft) {
        setCompany(draft.companyName || "");
        setDescription(draft.description || "");
      }
    } catch {}
    setReady(true);
  }, []);
  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOnboarding(true);
    setError("");
    try {
      localStorage.setItem(
        "cse.intake",
        JSON.stringify({
          companyName: company.trim(),
          description: description.trim(),
        }),
      );
      setUser(getUser() || `business-${crypto.randomUUID()}`);
      await api("inferProfile", {
        body: { companyName: company.trim(), description: description.trim() },
      });
      refreshAll();
      setOnboarding(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return (
      <main className="loading-workspace" role="status">
        Opening your workspace…
      </main>
    );
  if (!user || onboarding)
    return (
      <main className="welcome">
        <div className="welcome-story">
          <Brand />
          <div>
            <p className="eyebrow">BUILT FOR SUPPLIERS</p>
            <h1>
              Your next customer
              <br />
              is looking for
              <br />
              <span>what you do.</span>
            </h1>
            <p>
              Tell us about your business.
              <br />
              We’ll find the right opportunities.
            </p>
          </div>
          <span className="welcome-foot">
            Real buying signals. Conversations that matter.
          </span>
        </div>
        <div className="welcome-form">
          <form onSubmit={start}>
            <p className="eyebrow">LET’S GET TO KNOW YOUR BUSINESS</p>
            <h2>What do you do?</h2>
            <p>A little context helps us find your best-fit customers.</p>
            <label className="form-label" htmlFor="onboarding-company">
              Company name
            </label>
            <input
              id="onboarding-company"
              className="field"
              placeholder="e.g. Bay Controls Co"
              autoComplete="organization"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
              maxLength={120}
              disabled={busy}
            />
            <label className="form-label mt-5" htmlFor="onboarding-description">
              What does your company do?
            </label>
            <textarea
              id="onboarding-description"
              className="field min-h-32"
              placeholder="What you sell, who you help, and where you work…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={10}
              maxLength={4000}
              required
              disabled={busy}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                busy || !company.trim() || description.trim().length < 10
              }
            >
              <Icon name="spark" size={17} />
              {busy ? "Building your buyer profile…" : "Create my workspace"}
            </button>
            {busy && (
              <div className="mt-5">
                <ProgressBar label="Understanding your business" />
              </div>
            )}
            {error && (
              <p className="notice notice-error mt-5" role="alert">
                {error} Your business details are saved. Please try again.
              </p>
            )}
            <div className="welcome-note">
              <Icon name="credit" size={17} />
              <span>
                6 demo credits included. Review your profile before searching.
              </span>
            </div>
            <button
              type="button"
              className="text-link !w-auto !mt-5"
              disabled={busy}
              onClick={() => {
                setCompany("Bay Controls Co");
                setDescription(
                  "We retrofit motor control centers and install instrumentation at Northern California water plants. We sell to contractors currently collecting supplier quotes.",
                );
              }}
            >
              Try the Oakland example
            </button>
          </form>
        </div>
      </main>
    );
  return <div key={user}>{children}</div>;
}
