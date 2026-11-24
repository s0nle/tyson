/** Pure time helpers. All comparisons are on instants; zones only affect display and derivation text. */

export const DEFAULT_TZ = "America/Los_Angeles";

function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of `tz` at `date`, in minutes east of UTC (PST = -480). */
export function offsetMinutes(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");

/** ISO-8601 in the given zone with its offset, e.g. 2026-12-01T14:00:00-08:00. */
export function toZonedIso(input: Date | string, tz = DEFAULT_TZ): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const p = parts(date, tz);
  const off = offsetMinutes(date, tz);
  const sign = off < 0 ? "-" : "+";
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

/** "Dec 1, 2026, 2:00 PM PT" */
export function formatInZone(input: Date | string, tz = DEFAULT_TZ): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${s} ${tz === DEFAULT_TZ ? "PT" : tz}`;
}

/** "Nov 24" */
export function shortDate(input: Date | string, tz = DEFAULT_TZ): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(date);
}

/** Great-circle distance in miles. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function hoursBetween(from: Date | string, to: Date | string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
}
