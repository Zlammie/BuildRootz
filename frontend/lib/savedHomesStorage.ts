"use client";

const KEY = "br_savedHomes";

function parseList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((id) => typeof id === "string");
    }
  } catch {
    return [];
  }
  return [];
}

export function getLocalSavedHomes(): string[] {
  if (typeof window === "undefined") return [];
  return parseList(localStorage.getItem(KEY));
}

export function setLocalSavedHomes(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(Array.from(new Set(ids))));
}

export function toggleLocalSavedHome(id: string): string[] {
  const existing = getLocalSavedHomes();
  const next = existing.includes(id) ? existing.filter((item) => item !== id) : [...existing, id];
  setLocalSavedHomes(next);
  return next;
}

export function clearLocalSavedHomes() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
