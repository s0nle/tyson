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
  const [location, setLocation] = useState("");
  const [onboarding, setOnboarding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem("cse.intake") || "null");
      if (draft) {
        setCompany(draft.companyName || "");
        setDescription(draft.description || "");
        setLocation(draft.companyLocation || "");
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
          companyLocation: location.trim(),
        }),
      );
      setUser(getUser() || `business-${crypto.randomUUID()}`);
      await api("inferProfile", {
        body: { companyName: company.trim(), description: description.trim(), companyLocation: location.trim() },
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
        <div className="welcome-form">
          <Brand heading />
          <form onSubmit={start} aria-label="Business information">
            <label className="form-label" htmlFor="onboarding-company">
              Company Name
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
              What Does Your Company Do?
            </label>
            <textarea
              id="onboarding-description"
              className="field min-h-32"
              placeholder="What you sell and who you help…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={10}
              maxLength={4000}
              required
              disabled={busy}
            />
            <label className="form-label mt-5" htmlFor="onboarding-location">
              Where is your company located?
            </label>
            <input
              id="onboarding-location"
              className="field"
              placeholder="City and state, or ZIP code"
              autoComplete="address-level2"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              minLength={2}
              maxLength={120}
              required
              disabled={busy}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                busy || !company.trim() || description.trim().length < 10 || location.trim().length < 2
              }
            >
              <Icon name="chevron" size={16} />
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
          </form>
        </div>
      </main>
    );
  return <div key={user}>{children}</div>;
}
