import { NextResponse } from "next/server";
import { resolveBuilderParam, slugifyBuilder } from "../../lib/builder";
import {
  fetchBuilderProfiles,
  fetchPublicCommunities,
  fetchPublicHomes,
  type BuilderProfileRecord,
} from "../../lib/publicData";
import type { PublicCommunity, PublicHome } from "../../types/public";
import { cleanText, getConfiguredSiteOrigin, toAbsoluteUrl } from "../../lib/seo";

const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
const SITEMAP_HOME_LIMIT = 5000;
const SITEMAP_COMMUNITY_LIMIT = 1000;
const SITEMAP_BUILDER_LIMIT = 1000;

export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function latestIsoDate(
  current?: string | null,
  incoming?: string | null,
): string | undefined {
  if (!incoming) return current || undefined;
  if (!current) return incoming;
  return new Date(incoming) > new Date(current) ? incoming : current;
}

function resolveLastModified(...values: Array<string | null | undefined>): string {
  const resolved = values.reduce<string | undefined>(
    (latest, value) => latestIsoDate(latest, value),
    undefined,
  );
  return resolved || new Date().toISOString();
}

function normalizeRefs(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => cleanText(value)?.toLowerCase() || "")
    .filter(Boolean);
}

function isIndexableListing(home: PublicHome): boolean {
  return Boolean(home.id) && home.published !== false && home.isActive !== false;
}

function resolveCommunityPath(community: PublicCommunity): string | null {
  const slug = cleanText(community.slug);
  if (slug) {
    return `/community?communitySlug=${encodeURIComponent(slug)}`;
  }
  const id = cleanText(community.id);
  if (id) {
    return `/community?communityId=${encodeURIComponent(id)}`;
  }
  return null;
}

function resolveBuilderPathFromProfile(profile: BuilderProfileRecord): string | null {
  const builderParam =
    cleanText(profile.builderSlug) ||
    cleanText(profile.companyId) ||
    (cleanText(profile.builderName) ? slugifyBuilder(cleanText(profile.builderName) as string) : null);
  if (!builderParam) {
    return null;
  }
  return `/builder/${encodeURIComponent(builderParam)}`;
}

function buildUrlNode(path: string, origin: string, lastModified: string): string {
  return [
    "  <url>",
    `    <loc>${escapeXml(toAbsoluteUrl(path, origin))}</loc>`,
    `    <lastmod>${escapeXml(lastModified)}</lastmod>`,
    "  </url>",
  ].join("\n");
}

export async function GET(request: Request) {
  const configuredOrigin = getConfiguredSiteOrigin();
  const requestOrigin = new URL(request.url).origin;
  const origin =
    configuredOrigin === "http://localhost:3002" ? requestOrigin : configuredOrigin;

  const [homes, communities, builderProfiles] = await Promise.all([
    fetchPublicHomes(SITEMAP_HOME_LIMIT).catch(() => []),
    fetchPublicCommunities(SITEMAP_COMMUNITY_LIMIT).catch(() => []),
    fetchBuilderProfiles(SITEMAP_BUILDER_LIMIT).catch(() => []),
  ]);

  const activeHomes = homes.filter(isIndexableListing);
  const nowIso = new Date().toISOString();

  const latestHomeByCommunityRef = new Map<string, string>();
  const latestHomeByBuilderPath = new Map<string, string>();

  activeHomes.forEach((home) => {
    const homeUpdatedAt = home.updatedAt || nowIso;
    normalizeRefs([
      home.publicCommunityId,
      home.keepupCommunityId,
      home.communityId,
      home.communitySlug,
    ]).forEach((ref) => {
      latestHomeByCommunityRef.set(
        ref,
        latestIsoDate(latestHomeByCommunityRef.get(ref), homeUpdatedAt) || homeUpdatedAt,
      );
    });

    const builderParam = resolveBuilderParam(home);
    if (!builderParam) {
      return;
    }
    const builderPath = `/builder/${encodeURIComponent(builderParam)}`;
    latestHomeByBuilderPath.set(
      builderPath,
      latestIsoDate(latestHomeByBuilderPath.get(builderPath), homeUpdatedAt) || homeUpdatedAt,
    );
  });

  const communityNodes = communities
    .map((community) => {
      const path = resolveCommunityPath(community);
      if (!path) return null;

      const refs = normalizeRefs([community.id, community.keepupCommunityId, community.slug]);
      const latestHomeForCommunity = refs.reduce<string | undefined>(
        (latest, ref) => latestIsoDate(latest, latestHomeByCommunityRef.get(ref)),
        undefined,
      );
      const hasActiveListing = Boolean(latestHomeForCommunity);
      if (!hasActiveListing && community.published !== true) {
        return null;
      }

      return buildUrlNode(
        path,
        origin,
        resolveLastModified(community.updatedAt, latestHomeForCommunity),
      );
    })
    .filter((node): node is string => Boolean(node));

  builderProfiles.forEach((profile) => {
    if (profile.isVisible !== true) {
      return;
    }
    const path = resolveBuilderPathFromProfile(profile);
    if (!path) {
      return;
    }
    latestHomeByBuilderPath.set(
      path,
      latestIsoDate(latestHomeByBuilderPath.get(path), profile.updatedAt) ||
        profile.updatedAt ||
        nowIso,
    );
  });

  const builderNodes = Array.from(latestHomeByBuilderPath.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, updatedAt]) => buildUrlNode(path, origin, resolveLastModified(updatedAt)));

  const listingNodes = activeHomes.map((home) =>
    buildUrlNode(
      `/listing/${encodeURIComponent(home.id)}`,
      origin,
      resolveLastModified(home.updatedAt),
    ),
  );

  const sitemapBody = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    buildUrlNode("/", origin, resolveLastModified(nowIso)),
    buildUrlNode("/listings", origin, resolveLastModified(nowIso)),
    ...listingNodes,
    ...builderNodes,
    ...communityNodes,
    "</urlset>",
  ].join("\n");

  return new NextResponse(sitemapBody, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
