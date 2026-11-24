import { ContractError, type InferProfileRequest, SupplierProfile, type UpdateProfileRequest } from "@/contract";
import { getDoc, putDoc } from "../db";
import type { Deps } from "../deps";
import { AGENTS, iso, logActivity, type Org, rep } from "./base";

export async function getProfile(deps: Deps, org: Org) {
  return getDoc(deps.db, org.id, "profile", org.id, SupplierProfile);
}

export async function requireApprovedProfile(deps: Deps, org: Org) {
  const p = await getProfile(deps, org);
  if (!p) throw new ContractError("conflict", "Create a supplier profile first");
  if (p.status !== "approved") throw new ContractError("conflict", "Approve the supplier profile before running discovery");
  return p;
}

export async function inferProfile(deps: Deps, org: Org, req: InferProfileRequest) {
  const companyName = req.companyName ?? "";
  const inf = await deps.ai.inferIcp({ companyName, description: req.description });
  const prev = await getProfile(deps, org);
  const profile = SupplierProfile.parse({
    id: org.id,
    orgId: org.id,
    companyName: companyName || inf.companyName,
    description: req.description,
    capabilities: inf.capabilities,
    regions: inf.regions,
    certifications: inf.certifications,
    pastWins: prev?.pastWins ?? "",
    typicalQuoteSize: prev?.typicalQuoteSize ?? "",
    quotePrepDays: inf.quotePrepDays,
    icp: inf.icp.map((f) => ({ ...f, status: "proposed" })),
    adjacentSegments: inf.adjacentSegments.map((s) => ({ ...s, id: crypto.randomUUID(), status: "proposed" })),
    status: "draft",
    approvedAt: null,
    version: (prev?.version ?? 0) + 1,
    updatedAt: iso(deps),
  });
  await putDoc(deps.db, org.id, "profile", org.id, profile, iso(deps));
  await logActivity(deps, deps.db, org, {
    actor: AGENTS.planner,
    type: "profile_inferred",
    summary: `Planner inferred ICP v${profile.version}: ${profile.capabilities.join(", ")} → ${profile.icp.find((f) => f.key === "buyer_roles")?.values.join(", ")}`,
  });
  return profile;
}

export async function updateProfile(deps: Deps, org: Org, req: UpdateProfileRequest) {
  const p = await getProfile(deps, org);
  if (!p) throw new ContractError("not_found", "No profile yet — describe what you sell first");
  const next = { ...p };
  for (const k of ["companyName", "capabilities", "regions", "certifications", "pastWins", "typicalQuoteSize", "quotePrepDays"] as const) {
    if (req[k] !== undefined) (next as Record<string, unknown>)[k] = req[k];
  }
  if (req.icp) {
    next.icp = p.icp.map((f) => {
      const d = req.icp?.find((x) => x.key === f.key);
      if (!d) return f;
      return d.status === "edited" ? { ...f, status: "edited", values: d.values ?? f.values, confidence: 1 } : { ...f, status: d.status };
    });
  }
  if (req.segments) {
    next.adjacentSegments = p.adjacentSegments.map((s) => {
      const d = req.segments?.find((x) => x.id === s.id);
      return d ? { ...s, status: d.status } : s;
    });
  }
  const changed = JSON.stringify(next) !== JSON.stringify(p);
  if (req.serviceArea !== undefined) next.serviceArea = req.serviceArea;
  const out = SupplierProfile.parse({
    ...next,
    status: changed ? "draft" : p.status,
    approvedAt: changed ? null : p.approvedAt,
    version: changed && p.status === "approved" ? p.version + 1 : p.version,
    updatedAt: iso(deps),
  });
  await putDoc(deps.db, org.id, "profile", org.id, out, iso(deps));
  await logActivity(deps, deps.db, org, { actor: rep(org), type: "profile_updated", summary: `Rep edited profile v${out.version}` });
  return out;
}

export async function approveProfile(deps: Deps, org: Org) {
  const p = await getProfile(deps, org);
  if (!p) throw new ContractError("not_found", "No profile yet");
  if (p.capabilities.length === 0) throw new ContractError("bad_request", "Add at least one capability before approving");
  const out = SupplierProfile.parse({
    ...p,
    icp: p.icp.map((f) => (f.status === "proposed" ? { ...f, status: "accepted" } : f)),
    status: "approved",
    approvedAt: iso(deps),
    updatedAt: iso(deps),
  });
  await putDoc(deps.db, org.id, "profile", org.id, out, iso(deps));
  await logActivity(deps, deps.db, org, {
    actor: rep(org),
    type: "profile_approved",
    summary: `Rep approved buyer profile v${out.version} (${out.capabilities.length} capabilities, ${out.adjacentSegments.filter((s) => s.status === "accepted").length} adjacent segments)`,
  });
  return out;
}
