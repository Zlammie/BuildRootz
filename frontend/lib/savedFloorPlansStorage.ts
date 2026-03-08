"use client";

const KEY = "br_savedFloorPlans";

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

export function getLocalSavedFloorPlans(): string[] {
  if (typeof window === "undefined") return [];
  return parseList(localStorage.getItem(KEY));
}

export function setLocalSavedFloorPlans(ids: string[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(Array.from(new Set(ids))));
}

export function toggleLocalSavedFloorPlan(id: string): string[] {
  const existing = getLocalSavedFloorPlans();
  const next = existing.includes(id) ? existing.filter((item) => item !== id) : [...existing, id];
  setLocalSavedFloorPlans(next);
  return next;
}
