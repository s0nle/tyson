"use client";
import { type Client, createClient } from "@/contract";

const KEY = "cse.user";
export function getUser(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setUser(name: string) {
  try {
    localStorage.setItem(KEY, name.trim().toLowerCase());
  } catch {}
  window.dispatchEvent(new Event("app:session"));
}

/** Every component calls the API through this typed client. No raw fetch. */
export const api: Client = createClient({
  baseUrl: "",
  headers: (): Record<string, string> => {
    const u = getUser();
    return u ? { authorization: `Bearer ${encodeURIComponent(u)}` } : {};
  },
});

export function refreshAll() {
  window.dispatchEvent(new Event("app:refresh"));
}
