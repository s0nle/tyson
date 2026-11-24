"use client";
import "leaflet/dist/leaflet.css";
import type { Circle, Map as LeafletMap, Marker } from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { ServiceArea } from "@/contract";
import { api, refreshAll } from "@/lib/api";

const DEFAULT = { label: "Oakland, CA", lat: 37.8044, lng: -122.2712 };
const MILE = 1609.344;

/** Marketplace-style service area: pick a center, drag the radius, save. Leads outside it are ruled out. */
export function ServiceAreaMap({ value, onSaved }: { value: ServiceArea | null; onSaved: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const circle = useRef<Circle | null>(null);
  const marker = useRef<Marker | null>(null);
  const [center, setCenter] = useState(value ? { label: value.label, lat: value.lat, lng: value.lng } : DEFAULT);
  const [radius, setRadius] = useState(value?.radiusMiles ?? 25);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [status, setStatus] = useState("");

  // create the map once (Leaflet touches window, so load it on the client only)
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], 9);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "© OpenStreetMap contributors",
      }).addTo(m);
      circle.current = L.circle([center.lat, center.lng], { radius: radius * MILE, color: "#2859c5", weight: 2, fillOpacity: 0.12 }).addTo(m);
      marker.current = L.marker([center.lat, center.lng], {
        icon: L.divIcon({ className: "area-pin", html: "<span></span>", iconSize: [18, 18] }),
      }).addTo(m);
      m.fitBounds(circle.current.getBounds(), { padding: [12, 12] });
      m.on("click", (e) => setCenter({ label: `${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`, lat: e.latlng.lat, lng: e.latlng.lng }));
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: map is created once
  }, []);

  // keep the circle in sync with center + radius
  useEffect(() => {
    if (!map.current || !circle.current || !marker.current) return;
    circle.current.setLatLng([center.lat, center.lng]);
    circle.current.setRadius(radius * MILE);
    marker.current.setLatLng([center.lat, center.lng]);
    map.current.fitBounds(circle.current.getBounds(), { padding: [12, 12] });
  }, [center, radius]);

  async function find() {
    if (q.trim().length < 2) return;
    setStatus("Searching…");
    try {
      const r = await api("geoSearch", { query: { q } });
      setResults(r.results);
      setStatus(r.results.length ? "" : "No places found. Try a city and state.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  async function save(area: ServiceArea | null) {
    setStatus("Saving…");
    try {
      await api("updateProfile", { body: { serviceArea: area } });
      await api("refreshLeads", { body: {} });
      onSaved();
      refreshAll();
      setStatus(area ? `Saved. Opportunities beyond ${area.radiusMiles} mi are ruled out.` : "Service area cleared.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <div className="service-area">
      <span className="form-label">Service area</span>
      <form
        className="area-search"
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
      >
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="City, county or ZIP" aria-label="Find a location" />
        <button type="submit" className="btn btn-small">
          Find
        </button>
      </form>
      {results.length > 0 && (
        <ul className="area-results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button
                type="button"
                onClick={() => {
                  setCenter(r);
                  setResults([]);
                  setQ("");
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={el} className="area-map" role="img" aria-label={`Map: ${radius} mile radius around ${center.label}`} />
      <label className="area-radius">
        <span>
          Within <strong>{radius} mi</strong> of {center.label}
        </span>
        <input type="range" min={5} max={150} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
      </label>
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn btn-primary btn-small" onClick={() => save({ ...center, radiusMiles: radius })}>
          Save service area
        </button>
        {value && (
          <button type="button" className="btn btn-small" onClick={() => save(null)}>
            Clear
          </button>
        )}
      </div>
      {status && <p className="field-help">{status}</p>}
      <p className="field-help">Click the map to move the center. Distances use each project's published location.</p>
    </div>
  );
}
