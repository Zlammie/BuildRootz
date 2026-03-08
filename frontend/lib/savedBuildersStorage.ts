"use client";

const KEY = "br_savedBuilders";

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

export function getLocalSavedBuilders(): string[] {
  if (typeof window === "undefined") return [];
  return parseList(localStorage.getItem(KEY));
}

export function setLocalSavedBuilders(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(Array.from(new Set(ids))));
}

export function toggleLocalSavedBuilder(id: string): string[] {
  const existing = getLocalSavedBuilders();
  const next = existing.includes(id) ? existing.filter((item) => item !== id) : [...existing, id];
  setLocalSavedBuilders(next);
  return next;
}

export function clearLocalSavedBuilders() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
