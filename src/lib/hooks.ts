"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getUser } from "./api";

/** Poll a loader every `ms`, on key change, and on app:refresh / app:session. The realtime layer. */
export function usePoll<T>(load: () => Promise<T>, key: unknown[] = [], ms = 2500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const ref = useRef(load);
  ref.current = load;
  const reload = useCallback(async () => {
    if (!getUser()) return;
    try {
      setData(await ref.current());
      setError(null);
    } catch (e) {
      setError(e as Error);
    }
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: key drives reloads
  useEffect(() => {
    void reload();
    const t = ms > 0 ? setInterval(reload, ms) : undefined;
    const h = () => void reload();
    window.addEventListener("app:refresh", h);
    window.addEventListener("app:session", h);
    return () => {
      if (t) clearInterval(t);
      window.removeEventListener("app:refresh", h);
      window.removeEventListener("app:session", h);
    };
  }, [reload, ms, ...key]);
  return { data, error, reload };
}

export function useUser() {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => {
    const as = new URLSearchParams(window.location.search).get("as");
    if (as) {
      try {
        localStorage.setItem("cse.user", as.toLowerCase());
      } catch {}
    }
    setU(getUser());
    const h = () => setU(getUser());
    window.addEventListener("app:session", h);
    return () => window.removeEventListener("app:session", h);
  }, []);
  return u;
}
