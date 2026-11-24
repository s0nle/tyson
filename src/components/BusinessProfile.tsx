"use client";
import { useEffect, useState } from "react";
import type { IcpField, SupplierProfile } from "@/contract";
import { api, refreshAll } from "@/lib/api";
import { HoverAccordion } from "./HoverPanels";
import { Icon } from "./ui";
import { ProgressBar } from "./Progress";

type Act = (fn: () => Promise<unknown>) => Promise<boolean>;
export function BusinessProfile({
  profile,
  onSaved,
}: {
  profile: SupplierProfile | null;
  onSaved: () => Promise<void>;
}) {
  const [company, setCompany] = useState(profile?.companyName || "");
  const [description, setDescription] = useState(profile?.description || "");
  const [busy, setBusy] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (profile) {
      setCompany(profile.companyName);
      setDescription(profile.description);
    } else {
      try {
        const draft = JSON.parse(localStorage.getItem("cse.intake") || "null");
        if (draft) {
          setCompany(draft.companyName || "");
          setDescription(draft.description || "");
        }
      } catch {}
    }
  }, [profile?.id, profile?.companyName, profile?.description]);
  const act: Act = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onSaved();
      refreshAll();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const form = (
    <form
      className="business-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setInferring(true);
        try {
          await act(async () => {
            await api("inferProfile", {
              body: {
                companyName: company.trim(),
                description: description.trim(),
              },
            });
            try {
              localStorage.setItem(
                "cse.intake",
                JSON.stringify({
                  companyName: company.trim(),
                  description: description.trim(),
                }),
              );
            } catch {}
          });
        } finally {
          setInferring(false);
        }
      }}
    >
      <label className="block">
        <span className="form-label">Company name</span>
        <input
          className="field"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          required
          maxLength={120}
          disabled={busy}
        />
      </label>
      <label className="block">
        <span className="form-label">What does your company do?</span>
        <textarea
          className="field min-h-28"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={10}
          maxLength={4000}
          disabled={busy}
        />
      </label>
      <button
        type="submit"
        className="btn btn-primary"
        disabled={busy || !company.trim() || description.trim().length < 10}
      >
        {inferring
          ? "Building profile…"
          : profile
            ? "Update buyer profile"
            : "Build buyer profile"}
      </button>
      {inferring && <ProgressBar label="Understanding your business" />}
      <p className="field-help">Saved business details guide your search.</p>
    </form>
  );
  return (
    <div className="business-content">
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {profile ? (
        <>
          <div className="profile-status">
            <span
              className={`chip ${profile.status === "approved" ? "tone-open" : "tone-review"}`}
            >
              {profile.status === "approved"
                ? "Approved for search"
                : "Ready for your review"}
            </span>
            <p>Hover to expand. Click to keep a section open.</p>
          </div>
          <HoverAccordion
            title={profile.companyName || "Company details"}
            meta={<Icon name="building" size={17} />}
          >
            {form}
          </HoverAccordion>
          <h3 className="rail-section-label">YOUR IDEAL BUYERS</h3>
          <div className="buyer-stack">
            {profile.icp.map((f) => (
              <BuyerField key={f.key} field={f} act={act} busy={busy} />
            ))}
          </div>
          <Preferences profile={profile} act={act} busy={busy} />
          <HoverAccordion
            title="Adjacent markets"
            meta={profile.adjacentSegments.length}
          >
            <p className="field-help mb-4">
              Only included segments are used for search.
            </p>
            {profile.adjacentSegments.map((s) => (
              <div className="segment-row" key={s.id}>
                <strong>{s.name}</strong>
                <p>{s.rationale}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy || s.status === "accepted"}
                    onClick={() =>
                      act(() =>
                        api("updateProfile", {
                          body: {
                            segments: [{ id: s.id, status: "accepted" }],
                          },
                        }),
                      )
                    }
                  >
                    {s.status === "accepted" ? "Included" : "Include"}
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    disabled={busy || s.status === "dismissed"}
                    onClick={() =>
                      act(() =>
                        api("updateProfile", {
                          body: {
                            segments: [{ id: s.id, status: "dismissed" }],
                          },
                        }),
                      )
                    }
                  >
                    {s.status === "dismissed" ? "Dismissed" : "Dismiss"}
                  </button>
                </div>
              </div>
            ))}
          </HoverAccordion>
          <div className="profile-approve">
            <p>
              {profile.status === "approved"
                ? "Your next search will use this profile."
                : "Approve these buyers to start finding opportunities."}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || profile.status === "approved"}
              onClick={() => act(() => api("approveProfile"))}
            >
              <Icon name="check" size={17} />
              {profile.status === "approved"
                ? "Profile approved"
                : "Approve & use for search"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-2 mb-5">
            Describe your business to build your buyer profile.
          </p>
          {form}
        </>
      )}
    </div>
  );
}
function Confidence({ value }: { value: number }) {
  const tone = value >= 0.75 ? "good" : value >= 0.5 ? "fair" : "poor";
  return (
    <span className={`confidence-meter ${tone}`}>
      <span className="confidence-track">
        <span style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <strong>{Math.round(value * 100)}%</strong>
    </span>
  );
}
function BuyerField({
  field: f,
  act,
  busy,
}: {
  field: IcpField;
  act: Act;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(f.values.join("\n"));
  useEffect(() => {
    if (!editing) setValue(f.values.join("\n"));
  }, [f.values.join("\n"), editing]);
  const decide = (
    status: "accepted" | "edited" | "dismissed",
    values?: string[],
  ) =>
    act(() =>
      api("updateProfile", { body: { icp: [{ key: f.key, status, values }] } }),
    );
  return (
    <HoverAccordion
      title={f.label}
      meta={<Confidence value={f.confidence} />}
      className={f.status === "dismissed" ? "dismissed" : ""}
    >
      {editing ? (
        <>
          <textarea
            className="field min-h-28"
            aria-label={`Edit ${f.label}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              className="btn btn-small btn-primary"
              disabled={busy}
              onClick={async () => {
                if (
                  await decide(
                    "edited",
                    value
                      .split("\n")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  )
                )
                  setEditing(false);
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <ul className="buyer-values">
          {f.values.length ? (
            f.values.map((v, i) => <li key={i}>{v}</li>)
          ) : (
            <li className="text-ink-3">Not enough information yet.</li>
          )}
        </ul>
      )}
      <p className="buyer-rationale">{f.rationale}</p>
      <div className="buyer-actions">
        <button
          type="button"
          className={`btn btn-small ${f.status === "accepted" || f.status === "edited" ? "tone-open" : ""}`}
          disabled={busy || f.status === "accepted" || f.status === "edited"}
          onClick={() => decide("accepted")}
        >
          {f.status === "accepted"
            ? "Kept"
            : f.status === "edited"
              ? "Edited"
              : "Keep"}
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
        <button
          type="button"
          className="text-link ml-auto"
          disabled={busy || f.status === "dismissed"}
          onClick={() => decide("dismissed")}
        >
          {f.status === "dismissed" ? "Dismissed" : "Dismiss"}
        </button>
      </div>
    </HoverAccordion>
  );
}
function Preferences({
  profile,
  act,
  busy,
}: {
  profile: SupplierProfile;
  act: Act;
  busy: boolean;
}) {
  const [capabilities, setCapabilities] = useState(
    profile.capabilities.join("\n"),
  );
  const [regions, setRegions] = useState(profile.regions.join(", "));
  const [days, setDays] = useState(profile.quotePrepDays);
  const [certifications, setCertifications] = useState(
    profile.certifications.join(", "),
  );
  useEffect(() => {
    setCapabilities(profile.capabilities.join("\n"));
    setRegions(profile.regions.join(", "));
    setDays(profile.quotePrepDays);
    setCertifications(profile.certifications.join(", "));
  }, [
    profile.capabilities.join("\n"),
    profile.regions.join(", "),
    profile.quotePrepDays,
    profile.certifications.join(", "),
  ]);
  const list = (v: string, sep: RegExp) =>
    v
      .split(sep)
      .map((x) => x.trim())
      .filter(Boolean);
  return (
    <HoverAccordion title="Services & preferences">
      <form
        className="business-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() =>
            api("updateProfile", {
              body: {
                capabilities: list(capabilities, /\n/),
                regions: list(regions, /,/),
                certifications: list(certifications, /,/),
                quotePrepDays: days,
              },
            }),
          );
        }}
      >
        <label>
          <span className="form-label">Services (one per line)</span>
          <textarea
            className="field min-h-28"
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            required
          />
        </label>
        <label>
          <span className="form-label">Regions served</span>
          <input
            className="field"
            value={regions}
            onChange={(e) => setRegions(e.target.value)}
          />
        </label>
        <label>
          <span className="form-label">Quote preparation (days)</span>
          <input
            className="field"
            type="number"
            min={1}
            max={60}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 1)}
          />
        </label>
        <label>
          <span className="form-label">Certifications</span>
          <input
            className="field"
            value={certifications}
            onChange={(e) => setCertifications(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn"
          disabled={busy || !list(capabilities, /\n/).length}
        >
          Save preferences
        </button>
        <p className="field-help">
          Save preferences before approving the profile.
        </p>
      </form>
    </HoverAccordion>
  );
}
