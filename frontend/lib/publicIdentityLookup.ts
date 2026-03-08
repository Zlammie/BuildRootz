export type BuilderProfileSummary = {
  companyId: string;
  builderName?: string;
  builderSlug?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

export type PublicCommunitySummary = {
  publicCommunityId: string;
  name?: string;
  slug?: string;
  city?: string;
  state?: string;
  heroImageUrl?: string;
  imageUrlsPreview?: string[];
  photosPreview?: string[];
  highlights?: string[];
};

const builderCache = new Map<string, BuilderProfileSummary | null>();
const communityCache = new Map<string, PublicCommunitySummary | null>();

function normalizeObjectIdList(ids: string[]): string[] {
  const unique = new Set<string>();
  (ids || [])
    .map((id) => (typeof id === "string" ? id.trim().toLowerCase() : ""))
    .filter(Boolean)
    .forEach((id) => {
      if (!/^[a-f0-9]{24}$/i.test(id)) return;
      unique.add(id);
    });
  return Array.from(unique);
}

function toBuilderMap(ids: string[]): Record<string, BuilderProfileSummary> {
  const out: Record<string, BuilderProfileSummary> = {};
  ids.forEach((id) => {
    const item = builderCache.get(id);
    if (!item) return;
    out[id] = item;
  });
  return out;
}

function toCommunityMap(ids: string[]): Record<string, PublicCommunitySummary> {
  const out: Record<string, PublicCommunitySummary> = {};
  ids.forEach((id) => {
    const item = communityCache.get(id);
    if (!item) return;
    out[id] = item;
  });
  return out;
}

export async function fetchBuilderProfilesByCompanyIds(
  companyIds: string[],
): Promise<Record<string, BuilderProfileSummary>> {
  const normalizedIds = normalizeObjectIdList(companyIds);
  if (!normalizedIds.length) return {};

  const missing = normalizedIds.filter((id) => !builderCache.has(id));
  if (missing.length) {
    try {
      const response = await fetch(
        `/api/public/builders/lookup?companyIds=${encodeURIComponent(missing.join(","))}`,
        { cache: "force-cache" },
      );
      if (response.ok) {
        const payload = await response.json();
        const rows = Array.isArray(payload?.builders) ? payload.builders : [];
        const found = new Set<string>();
        rows.forEach((row: BuilderProfileSummary) => {
          const companyId =
            typeof row?.companyId === "string" ? row.companyId.trim().toLowerCase() : "";
          if (!companyId) return;
          found.add(companyId);
          builderCache.set(companyId, {
            companyId,
            builderName: row.builderName,
            builderSlug: row.builderSlug,
            logoUrl: row.logoUrl,
            primaryColor: row.primaryColor,
            secondaryColor: row.secondaryColor,
          });
        });
        missing.forEach((id) => {
          if (!found.has(id)) builderCache.set(id, null);
        });
      } else {
        missing.forEach((id) => builderCache.set(id, null));
      }
    } catch {
      missing.forEach((id) => builderCache.set(id, null));
    }
  }

  return toBuilderMap(normalizedIds);
}

export async function fetchPublicCommunitiesByIds(
  publicCommunityIds: string[],
): Promise<Record<string, PublicCommunitySummary>> {
  const normalizedIds = normalizeObjectIdList(publicCommunityIds);
  if (!normalizedIds.length) return {};

  const missing = normalizedIds.filter((id) => !communityCache.has(id));
  if (missing.length) {
    try {
      const response = await fetch(
        `/api/public/communities/lookup?communityIds=${encodeURIComponent(missing.join(","))}`,
        { cache: "force-cache" },
      );
      if (response.ok) {
        const payload = await response.json();
        const rows = Array.isArray(payload?.communities) ? payload.communities : [];
        const found = new Set<string>();
        rows.forEach((row: PublicCommunitySummary) => {
          const communityId =
            typeof row?.publicCommunityId === "string"
              ? row.publicCommunityId.trim().toLowerCase()
              : "";
          if (!communityId) return;
          found.add(communityId);
          communityCache.set(communityId, {
            publicCommunityId: communityId,
            name: row.name,
            slug: row.slug,
            city: row.city,
            state: row.state,
            heroImageUrl: row.heroImageUrl,
            imageUrlsPreview: Array.isArray(row.imageUrlsPreview) ? row.imageUrlsPreview : undefined,
            photosPreview: Array.isArray(row.photosPreview) ? row.photosPreview : undefined,
            highlights: Array.isArray(row.highlights) ? row.highlights : undefined,
          });
        });
        missing.forEach((id) => {
          if (!found.has(id)) communityCache.set(id, null);
        });
      } else {
        missing.forEach((id) => communityCache.set(id, null));
      }
    } catch {
      missing.forEach((id) => communityCache.set(id, null));
    }
  }

  return toCommunityMap(normalizedIds);
}
