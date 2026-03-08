export type SearchFilters = {
  priceMin?: number;
  priceMax?: number;
  beds?: string | number;
  baths?: string | number;
  moveIn?: string;
  sortKey?: string;
  [key: string]: unknown;
};

function toNumber(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  const num = Number(String(val).replace(/[^0-9.]/g, ""));
  return Number.isNaN(num) ? null : num;
}

function labelBeds(val?: string | number) {
  if (val === undefined || val === null) return null;
  const clean = String(val);
  return `${clean.replace("+", "")}+ beds`;
}

function labelBaths(val?: string | number) {
  if (val === undefined || val === null) return null;
  const clean = String(val);
  return `${clean.replace("+", "")}+ baths`;
}

function labelPrice(min?: number | null, max?: number | null) {
  if (min && max) return `between $${min.toLocaleString()} and $${max.toLocaleString()}`;
  if (min) return `from $${min.toLocaleString()}`;
  if (max) return `under $${max.toLocaleString()}`;
  return null;
}

function labelMoveIn(moveIn?: string) {
  if (!moveIn || moveIn === "all") return null;
  const map: Record<string, string> = {
    ready: "Ready to move in",
    "1-2": "1-2 months",
    "3-6": "3-6 months",
  };
  return map[moveIn] ?? null;
}

export function summarizeFilters(filters: SearchFilters): string {
  if (!filters) return "All homes";
  const priceMin = toNumber(filters.priceMin);
  const priceMax = toNumber(filters.priceMax);
  const parts: string[] = [];
  const bed = labelBeds(filters.beds);
  const bath = labelBaths(filters.baths);
  const price = labelPrice(priceMin, priceMax);
  const move = labelMoveIn(filters.moveIn as string);
  if (bed) parts.push(bed);
  if (bath) parts.push(bath);
  if (price) parts.push(price);
  if (move) parts.push(move);
  return parts.length ? parts.join(", ") : "All homes";
}

export function autoNameFromFilters(filters: SearchFilters): string {
  const summary = summarizeFilters(filters);
  return summary === "All homes" ? "All homes" : summary;
}
