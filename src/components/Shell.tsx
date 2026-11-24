"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api, refreshAll, setUser } from "@/lib/api";
import { usePoll, useUser } from "@/lib/hooks";

const NAV = [
  { href: "/", label: "Supplier profile", hint: "What you sell, who buys it" },
  { href: "/opportunities", label: "Opportunities", hint: "Contractors asking for quotes" },
  { href: "/pipeline", label: "Pipeline", hint: "Outreach, replies, credits" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const path = usePathname();
  const { data: me } = usePoll(() => api("getMe"), [user], 4000);
  const [name, setName] = useState("");

  if (!user) {
    return (
      <main className="min-h-screen grid place-items-center p-4">
        <form
          className="panel p-6 w-full max-w-sm space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setUser(name);
          }}
        >
          <div>
            <h1 className="text-2xl font-extrabold condensed">Contractor Sales Engine</h1>
            <p className="text-sm text-ink-2 mt-1">Sign in with any name. Each name is its own supplier account with 6 demo credits.</p>
          </div>
          <input className="field" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="submit" className="btn btn-primary w-full justify-center">Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="border-b lg:border-b-0 lg:border-r border-rule bg-sheet lg:min-h-screen p-4 flex lg:flex-col gap-4">
        <div className="lg:mb-4">
          <div className="text-lg font-extrabold condensed leading-tight">Contractor<br className="hidden lg:block" /> Sales Engine</div>
        </div>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href) || (n.href === "/opportunities" && path.startsWith("/leads"));
            return (
              <Link key={n.href} href={n.href} className={`rounded-md px-3 py-2 whitespace-nowrap ${active ? "bg-spec-2 text-spec" : "hover:bg-rule-2"}`}>
                <div className="text-sm font-semibold">{n.label}</div>
                <div className="text-xs text-ink-3 hidden lg:block">{n.hint}</div>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden lg:block space-y-3 text-xs text-ink-2">
          {me && (
            <div className="panel p-3">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-ink">Credits</span>
                <span className="text-2xl font-extrabold condensed text-ink">{me.credits.available}</span>
              </div>
              <div className="text-ink-3">{me.credits.spent} spent of {me.credits.granted}</div>
            </div>
          )}
          {me && (
            <div className="space-y-1">
              {Object.entries(me.providers).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{({ openai: "OpenAI", tavily: "Tavily search", hunter: "Hunter.io", resend: "Resend email", flexprice: "Flexprice billing" } as Record<string, string>)[k] ?? k}</span>
                  <span className={v === "live" ? "text-open font-semibold" : "text-ink-3"}>{v === "live" ? "Live" : "Fake"}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-rule">
            <span>Signed in as <b className="text-ink">{user}</b></span>
            <button type="button" className="underline" onClick={() => setUser("")}>Switch</button>
          </div>
          <button
            type="button"
            className="underline text-ink-3"
            onClick={async () => {
              if (confirm("Reset this account's leads, messages and credits?")) {
                await api("resetDemo");
                refreshAll();
              }
            }}
          >
            Reset demo data
          </button>
        </div>
      </aside>
      <main className="p-4 lg:p-8 max-w-[1400px] w-full">{children}</main>
    </div>
  );
}
