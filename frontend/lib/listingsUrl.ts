export type ListingsUrlParams = {
  publicCommunityId?: string;
  companyId?: string;
  keepupFloorPlanId?: string;
  planCatalogId?: string;
  q?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  bedsMin?: number;
  bathsMin?: number;
  minSqft?: number;
  maxSqft?: number;
  sort?: string;
  page?: number;
  pageSize?: number;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function shouldIncludeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function setIfPresent(params: URLSearchParams, key: string, value: unknown) {
  const normalized = normalizeString(value);
  if (normalized) params.set(key, normalized);
}

function setNumberIfPresent(params: URLSearchParams, key: string, value: unknown) {
  if (shouldIncludeNumber(value)) {
    params.set(key, String(value));
  }
}

export function buildListingsUrl(
  input: ListingsUrlParams = {},
  baseSearchParams?: URLSearchParams,
): string {
  const merged = new URLSearchParams(baseSearchParams ? baseSearchParams.toString() : "");

  setIfPresent(merged, "q", input.q);
  setIfPresent(merged, "publicCommunityId", input.publicCommunityId);
  setIfPresent(merged, "companyId", input.companyId);
  setIfPresent(merged, "keepupFloorPlanId", input.keepupFloorPlanId);
  setIfPresent(merged, "planCatalogId", input.planCatalogId);
  setIfPresent(merged, "status", input.status);
  setNumberIfPresent(merged, "minPrice", input.minPrice);
  setNumberIfPresent(merged, "maxPrice", input.maxPrice);
  setNumberIfPresent(merged, "bedsMin", input.bedsMin);
  setNumberIfPresent(merged, "bathsMin", input.bathsMin);
  setNumberIfPresent(merged, "minSqft", input.minSqft);
  setNumberIfPresent(merged, "maxSqft", input.maxSqft);
  setIfPresent(merged, "sort", input.sort);
  setNumberIfPresent(merged, "page", input.page);
  setNumberIfPresent(merged, "pageSize", input.pageSize);

  const query = merged.toString();
  return query ? `/listings?${query}` : "/listings";
}

// Manual test cases:
// buildListingsUrl({ publicCommunityId: "abc", companyId: "def" })
// => /listings?publicCommunityId=abc&companyId=def
// buildListingsUrl({ companyId: "def" }, new URLSearchParams("sort=price_desc&page=2"))
// => /listings?sort=price_desc&page=2&companyId=def
