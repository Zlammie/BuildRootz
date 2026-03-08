"use client";

const KEY = "br_savedCommunities";

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

export function getLocalSavedCommunities(): string[] {
  if (typeof window === "undefined") return [];
  return parseList(localStorage.getItem(KEY));
}

export function setLocalSavedCommunities(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(Array.from(new Set(ids))));
}

export function toggleLocalSavedCommunity(id: string): string[] {
  const existing = getLocalSavedCommunities();
  const next = existing.includes(id) ? existing.filter((item) => item !== id) : [...existing, id];
  setLocalSavedCommunities(next);
  return next;
}

export function clearLocalSavedCommunities() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
