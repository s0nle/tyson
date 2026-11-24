"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { IcpField, SupplierProfile } from "@/contract";
import { api, refreshAll } from "@/lib/api";
import { usePoll } from "@/lib/hooks";

const DEMO =
  "We retrofit motor control centers and install instrumentation at Northern California water plants. Our sales rep wants contractors currently collecting supplier quotes.";

export default function ProfilePage() {
  const { data } = usePoll(() => api("getProfile"), [], 0);
  const profile = data?.profile ?? null;
  const [desc, setDesc] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDesc(profile.description);
      setCompany(profile.companyName);
    }
  }, [profile?.id, profile?.version]);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      refreshAll();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-3xl font-extrabold condensed">Supplier profile</h1>
        <p className="text-ink-2 mt-1 max-w-2xl">Describe what you sell in plain language. The planner infers who buys it and what signals a live quote request. You approve every field before discovery uses it.</p>
      </header>

      <section className="panel p-5 space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_260px]">
          <label className="block">
            <span className="text-sm font-semibold">What do you sell, and to whom?</span>
            <textarea className="field mt-1 min-h-28" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={DEMO} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Company name</span>
            <input className="field mt-1" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Bay Controls Co" />
            <button type="button" className="text-xs text-spec underline mt-2" onClick={() => { setDesc(DEMO); setCompany("Bay Controls Co"); }}>
              Use the Oakland demo supplier
            </button>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={!!busy || desc.trim().length < 10} onClick={() => act("infer", () => api("inferProfile", { body: { description: desc, companyName: company } }))}>
            {busy === "infer" ? "Inferring buyer profile…" : profile ? "Re-infer buyer profile" : "Infer buyer profile"}
          </button>
          {err && <span className="text-sm text-redline">{err}</span>}
        </div>
      </section>

      {profile && <ProfileEditor profile={profile} act={act} busy={busy} />}
    </div>
  );
}

function ProfileEditor({ profile, act, busy }: { profile: SupplierProfile; act: (l: string, f: () => Promise<unknown>) => Promise<void>; busy: string | null }) {
  const [caps, setCaps] = useState(profile.capabilities.join("\n"));
  const [regions, setRegions] = useState(profile.regions.join(", "));
  const [certs, setCerts] = useState(profile.certifications.join(", "));
  const [wins, setWins] = useState(profile.pastWins);
  const [prep, setPrep] = useState(profile.quotePrepDays);
  useEffect(() => {
    setCaps(profile.capabilities.join("\n"));
    setRegions(profile.regions.join(", "));
    setCerts(profile.certifications.join(", "));
    setWins(profile.pastWins);
    setPrep(profile.quotePrepDays);
  }, [profile.version, profile.updatedAt]);
  const list = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);
  const dirty =
    caps !== profile.capabilities.join("\n") || regions !== profile.regions.join(", ") || certs !== profile.certifications.join(", ") || wins !== profile.pastWins || prep !== profile.quotePrepDays;

  return (
    <>
      <section className="panel p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="text-xl font-bold condensed">Capabilities and constraints</h2>
          <span className={`chip ${profile.status === "approved" ? "tone-open" : "tone-review"}`}>
            {profile.status === "approved" ? `Approved v${profile.version}` : `Draft v${profile.version}`}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">Services you can quote (one per line)</span>
            <textarea className="field mt-1 min-h-24" value={caps} onChange={(e) => setCaps(e.target.value)} />
            <span className="text-xs text-ink-3">These drive scope matching. Change them and the matches change.</span>
          </label>
          <div className="space-y-3">
            <label className="block"><span className="text-sm font-semibold">Regions</span><input className="field mt-1" value={regions} onChange={(e) => setRegions(e.target.value)} /></label>
            <label className="block"><span className="text-sm font-semibold">Certifications held</span><input className="field mt-1" value={certs} onChange={(e) => setCerts(e.target.value)} placeholder="Leave blank if none — missing ones stay unknown" /></label>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <label className="block"><span className="text-sm font-semibold">Past wins</span><input className="field mt-1" value={wins} onChange={(e) => setWins(e.target.value)} /></label>
              <label className="block"><span className="text-sm font-semibold">Quote prep (days)</span><input type="number" min={1} max={60} className="field mt-1" value={prep} onChange={(e) => setPrep(Number(e.target.value) || 1)} /></label>
            </div>
          </div>
        </div>
        {dirty && (
          <button
            type="button"
            className="btn"
            disabled={!!busy}
            onClick={() =>
              act("save", () =>
                api("updateProfile", { body: { capabilities: list(caps, /\n/), regions: list(regions, /,/), certifications: list(certs, /,/), pastWins: wins, quotePrepDays: prep } }),
              )
            }
          >
            Save changes
          </button>
        )}
      </section>

      <section className="panel">
        <div className="p-5 pb-3">
          <h2 className="text-xl font-bold condensed">Inferred buyer profile</h2>
          <p className="text-sm text-ink-2">Confidence shows how directly your description supports each field. Accept, edit or dismiss.</p>
        </div>
        <table className="datagrid">
          <thead><tr><th>Field</th><th>Values</th><th className="w-40">Confidence</th><th>Why</th><th className="w-44">Decision</th></tr></thead>
          <tbody>{profile.icp.map((f) => <IcpRow key={f.key} f={f} act={act} />)}</tbody>
        </table>
      </section>

      <section className="panel p-5 space-y-3">
        <h2 className="text-xl font-bold condensed">Adjacent segments</h2>
        <p className="text-sm text-ink-2">Suggested expansions. Discovery only uses the ones you accept.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {profile.adjacentSegments.map((s) => (
            <div key={s.id} className="border border-rule rounded-md p-4 space-y-2">
              <div className="flex justify-between items-baseline gap-2">
                <span className="font-semibold">{s.name}</span>
                <Confidence v={s.confidence} />
              </div>
              <p className="text-sm">{s.rationale}</p>
              <p className="text-sm text-ink-2 border-l-2 border-spec pl-2">Evidence: {s.evidence}</p>
              <div className="flex gap-2 items-center">
                <button type="button" className={`btn ${s.status === "accepted" ? "btn-primary" : ""}`} onClick={() => act("seg", () => api("updateProfile", { body: { segments: [{ id: s.id, status: "accepted" }] } }))}>Accept</button>
                <button type="button" className="btn" onClick={() => act("seg", () => api("updateProfile", { body: { segments: [{ id: s.id, status: "dismissed" }] } }))}>Dismiss</button>
                <span className="text-xs text-ink-3 capitalize">{s.status}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" className="btn btn-primary" disabled={!!busy || profile.status === "approved" || dirty} onClick={() => act("approve", () => api("approveProfile"))}>
          {profile.status === "approved" ? "Profile approved" : "Approve buyer profile"}
        </button>
        {profile.status === "approved" && <Link href="/opportunities" className="btn">Find opportunities</Link>}
        {dirty && <span className="text-sm text-ink-3">Save your edits before approving.</span>}
      </div>
    </>
  );
}

function Confidence({ v }: { v: number }) {
  const tone = v >= 0.75 ? "bg-open" : v >= 0.5 ? "bg-review" : "bg-redline";
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-2">
      <span className="w-16 h-1.5 bg-rule-2 rounded"><span className={`block h-1.5 rounded ${tone}`} style={{ width: `${v * 100}%` }} /></span>
      {v.toFixed(2)}
    </span>
  );
}

function IcpRow({ f, act }: { f: IcpField; act: (l: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(f.values.join("; "));
  const decide = (status: "accepted" | "dismissed" | "edited", values?: string[]) =>
    act("icp", () => api("updateProfile", { body: { icp: [{ key: f.key, status, values }] } }));
  return (
    <tr className={f.status === "dismissed" ? "opacity-50" : ""}>
      <td className="font-semibold whitespace-nowrap">{f.label}</td>
      <td>
        {editing ? (
          <div className="flex gap-2">
            <input className="field" value={val} onChange={(e) => setVal(e.target.value)} />
            <button type="button" className="btn" onClick={() => { void decide("edited", val.split(";").map((x) => x.trim()).filter(Boolean)); setEditing(false); }}>Save</button>
          </div>
        ) : f.values.length ? (
          f.values.join("; ")
        ) : (
          <span className="text-ink-3">Unknown</span>
        )}
      </td>
      <td><Confidence v={f.confidence} /></td>
      <td className="text-ink-2">{f.rationale}</td>
      <td>
        <div className="flex gap-1 flex-wrap items-center">
          <button type="button" className="btn !px-2 !py-1" onClick={() => decide("accepted")}>Accept</button>
          <button type="button" className="btn !px-2 !py-1" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="btn !px-2 !py-1" onClick={() => decide("dismissed")}>Dismiss</button>
        </div>
        <div className="text-xs text-ink-3 mt-1 capitalize">{f.status}</div>
      </td>
    </tr>
  );
}
