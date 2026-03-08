import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import NavBar from "../../../components/NavBar";
import {
  fetchPublicCommunitiesByBuilder,
  fetchPublicHomesByBuilder,
  fetchPublicHomesByCommunity,
  fetchBuilderProfileByRef,
  fetchBuilderInCommunitiesByCompanyId,
  fetchPlanCatalogByCompanyId,
  fetchOfferingsByCompanyId,
  fetchPublicCommunityById,
} from "../../../lib/publicData";
import type { PublicCommunity, PublicFloorPlan, PublicHome } from "../../../types/public";
import type {
  BuilderInCommunityRecord,
  CommunityPlanOfferingRecord,
  PlanCatalogRecord,
} from "../../../lib/publicData";
import SaveBuilderButton from "./SaveBuilderButton";
import BuilderTabs from "./BuilderTabs";
import WorkspaceQueueButton from "../../../components/workspace/WorkspaceQueueButton";
import BuyerWorkspaceSidebar from "../../../components/workspace/BuyerWorkspaceSidebar";
import styles from "./page.module.css";
import { mergeCommunityBuilderView } from "../../../../backend/services/builderInCommunityResolver";
import {
  DEFAULT_SITE_NAME,
  DEFAULT_TWITTER_CARD,
  cleanText,
  sanitizeCanonicalPath,
} from "../../../lib/seo";

export const dynamic = "force-dynamic";

type BuilderParams = { builderId: string };

type BuilderFloorPlan = PublicFloorPlan & {
  stories?: number | null;
  heroImageUrl?: string | null;
  previewUrl?: string | null;
  fileUrl?: string | null;
  communityRefs?: Array<{
    id: string;
    name?: string | null;
    slug?: string | null;
  }>;
};

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getInitials(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length) return "BR";
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeExternalUrl(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) return null;

  const withProtocol =
    /^https?:\/\//i.test(raw)
      ? raw
      : raw.startsWith("//")
        ? `https:${raw}`
        : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function isLikelyObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value.trim());
}

function parseGarageSpaces(
  garageSpaces: number | null | undefined,
  garage: string | undefined,
): number | null {
  if (typeof garageSpaces === "number" && Number.isFinite(garageSpaces)) return garageSpaces;
  if (!garage) return null;
  const match = garage.match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasNumericValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function minimumNumber(a: number | null | undefined, b: number | null | undefined): number | null {
  const aOk = hasNumericValue(a);
  const bOk = hasNumericValue(b);
  if (aOk && bOk) return Math.min(a, b);
  if (aOk) return a;
  if (bOk) return b;
  return null;
}

function listingIsActivePublic(home: PublicHome): boolean {
  if (home.published === false) return false;
  if (home.isActive === false) return false;
  if (home.status === "model") return false;
  return true;
}

function normalizeMatchToken(value: unknown): string {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function homeBelongsToBuilder(
  home: PublicHome,
  candidates: {
    companyIds: Set<string>;
    slugs: Set<string>;
    nameTokens: Set<string>;
  },
): boolean {
  const homeCompanyIds = [
    cleanString(home.keepupBuilderId).toLowerCase(),
    cleanString(home.companyId).toLowerCase(),
  ].filter(Boolean);
  if (homeCompanyIds.some((value) => candidates.companyIds.has(value))) {
    return true;
  }

  const homeSlug = cleanString(home.builderSlug).toLowerCase();
  if (homeSlug && candidates.slugs.has(homeSlug)) return true;

  const homeNameToken = normalizeMatchToken(home.builder);
  if (!homeNameToken) return false;
  if (candidates.nameTokens.has(homeNameToken)) return true;

  for (const token of candidates.nameTokens) {
    if (!token) continue;
    if (token.length >= 6 && homeNameToken.includes(token)) return true;
    if (homeNameToken.length >= 6 && token.includes(homeNameToken)) return true;
  }

  return false;
}

function uniqById<T extends { id?: string | null }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  rows.forEach((row) => {
    const id = cleanString(row.id);
    if (!id) return;
    if (!map.has(id)) map.set(id, row);
  });
  return Array.from(map.values());
}

function planKey(plan: BuilderFloorPlan): string {
  const planCatalogId = cleanString(plan.planCatalogId);
  if (planCatalogId) return `catalog:${planCatalogId}`;
  const keepupFloorPlanId = cleanString(plan.keepupFloorPlanId);
  if (keepupFloorPlanId) return `keepup:${keepupFloorPlanId}`;
  const name = cleanString(plan.name).toLowerCase();
  if (name) return `name:${name}`;
  return `id:${cleanString(plan.id)}`;
}

function mergeFloorPlans(plans: BuilderFloorPlan[]): BuilderFloorPlan[] {
  const grouped = new Map<string, BuilderFloorPlan>();
  plans.forEach((plan) => {
    const key = planKey(plan);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...plan,
        communityRefs: Array.isArray(plan.communityRefs) ? [...plan.communityRefs] : [],
      });
      return;
    }

    existing.basePriceFrom = minimumNumber(existing.basePriceFrom, plan.basePriceFrom);
    if (!hasNumericValue(existing.beds) && hasNumericValue(plan.beds)) existing.beds = plan.beds;
    if (!hasNumericValue(existing.baths) && hasNumericValue(plan.baths)) existing.baths = plan.baths;
    if (!hasNumericValue(existing.sqft) && hasNumericValue(plan.sqft)) existing.sqft = plan.sqft;
    if (!hasNumericValue(existing.garage) && hasNumericValue(plan.garage)) existing.garage = plan.garage;
    if (!hasNumericValue(existing.stories) && hasNumericValue(plan.stories)) existing.stories = plan.stories;
    if (!cleanString(existing.heroImageUrl) && cleanString(plan.heroImageUrl)) existing.heroImageUrl = plan.heroImageUrl;
    if (!cleanString(existing.previewUrl) && cleanString(plan.previewUrl)) existing.previewUrl = plan.previewUrl;
    if (!cleanString(existing.fileUrl) && cleanString(plan.fileUrl)) existing.fileUrl = plan.fileUrl;
    if (!cleanString(existing.name) && cleanString(plan.name)) existing.name = plan.name;
    if (!cleanString(existing.planCatalogId) && cleanString(plan.planCatalogId)) existing.planCatalogId = plan.planCatalogId;
    if (!cleanString(existing.keepupFloorPlanId) && cleanString(plan.keepupFloorPlanId)) {
      existing.keepupFloorPlanId = plan.keepupFloorPlanId;
    }

    const existingCommunityMap = new Map(
      (existing.communityRefs || [])
        .map((ref) => [cleanString(ref.id), ref] as const)
        .filter(([id]) => Boolean(id)),
    );
    (plan.communityRefs || []).forEach((ref) => {
      const id = cleanString(ref.id);
      if (!id) return;
      if (!existingCommunityMap.has(id)) {
        existingCommunityMap.set(id, ref);
      }
    });
    existing.communityRefs = Array.from(existingCommunityMap.values());
  });

  return Array.from(grouped.values()).sort((a, b) =>
    cleanString(a.name || "Plan").localeCompare(cleanString(b.name || "Plan")),
  );
}

function mapOfferingsToFloorPlansForCommunity(
  offerings: CommunityPlanOfferingRecord[],
  planCatalogById: Map<string, PlanCatalogRecord>,
  community: PublicCommunity,
): BuilderFloorPlan[] {
  const sorted = [...offerings].sort((a, b) => {
    const aOrder = typeof a.sortOrder === "number" ? a.sortOrder : 0;
    const bOrder = typeof b.sortOrder === "number" ? b.sortOrder : 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return cleanString(a.id).localeCompare(cleanString(b.id));
  });

  return sorted
    .map((offering, index) => {
      if (offering.isIncluded === false) return null;
      const planCatalogId = cleanString(offering.planCatalogId);
      if (!planCatalogId) return null;
      const catalog = planCatalogById.get(planCatalogId);
      if (!catalog) return null;
      const visibility = cleanString(offering.basePriceVisibility).toLowerCase();
      const basePriceFrom =
        visibility === "hidden"
          ? null
          : typeof offering.basePriceFrom === "number"
            ? offering.basePriceFrom
            : null;

      const heroImage =
        cleanString(offering.primaryImageOverrideUrl) ||
        cleanString(catalog.primaryImageUrl) ||
        cleanString(catalog.images?.[0]?.url) ||
        null;
      const previewUrl =
        cleanString(catalog.asset?.previewUrl) ||
        cleanString(catalog.previewUrl) ||
        null;
      const fileUrl =
        cleanString(catalog.asset?.fileUrl) ||
        cleanString(catalog.fileUrl) ||
        null;

      return {
        id: cleanString(offering.id) || `${cleanString(community.id)}-offering-${index + 1}`,
        name: cleanString(catalog.name) || cleanString(catalog.slug) || "Plan",
        communityId: cleanString(community.id) || null,
        communityName: cleanString(community.name) || null,
        communitySlug: cleanString(community.slug) || null,
        keepupFloorPlanId:
          cleanString(offering.keepupFloorPlanId) ||
          cleanString(catalog.keepupFloorPlanId) ||
          null,
        planCatalogId: planCatalogId || null,
        beds: typeof catalog.beds === "number" ? catalog.beds : null,
        baths: typeof catalog.baths === "number" ? catalog.baths : null,
        sqft: typeof catalog.sqft === "number" ? catalog.sqft : null,
        garage: parseGarageSpaces(catalog.garageSpaces, catalog.garage),
        stories: typeof catalog.stories === "number" ? catalog.stories : null,
        basePriceFrom,
        basePriceAsOf: cleanString(offering.basePriceAsOf) || null,
        detail: cleanString(offering.descriptionOverride) || cleanString(catalog.description) || null,
        heroImageUrl: heroImage,
        previewUrl,
        fileUrl,
        communityRefs: [
          {
            id: cleanString(community.id),
            name: cleanString(community.name) || null,
            slug: cleanString(community.slug) || null,
          },
        ],
      } as BuilderFloorPlan;
    })
    .filter((plan): plan is BuilderFloorPlan => Boolean(plan));
}

function inferCommunityPlansFromHomes(
  homes: PublicHome[],
  community: PublicCommunity,
): BuilderFloorPlan[] {
  const communityRefs = new Set(
    [
      cleanString(community.id),
      cleanString(community.keepupCommunityId),
      cleanString(community.slug),
    ].filter(Boolean),
  );
  const relatedHomes = homes.filter((home) => {
    const homeRefs = [
      cleanString(home.publicCommunityId),
      cleanString(home.keepupCommunityId),
      cleanString(home.communityId),
      cleanString(home.communitySlug),
    ];
    return homeRefs.some((value) => value && communityRefs.has(value));
  });

  const map = new Map<string, BuilderFloorPlan>();
  relatedHomes.forEach((home, index) => {
    const name = cleanString(home.planName) || cleanString(home.title);
    if (!name) return;
    const key = name.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        id: cleanString(home.planNumber) || `${cleanString(community.id)}-legacy-plan-${index + 1}`,
        name,
        communityId: cleanString(community.id) || null,
        communityName: cleanString(community.name) || null,
        communitySlug: cleanString(community.slug) || null,
        keepupFloorPlanId: cleanString(home.keepupFloorPlanId) || null,
        planCatalogId: cleanString(home.planCatalogId) || null,
        beds: typeof home.beds === "number" ? home.beds : null,
        baths: typeof home.baths === "number" ? home.baths : null,
        sqft: typeof home.sqft === "number" ? home.sqft : null,
        garage: typeof home.garage === "number" ? home.garage : null,
        basePriceFrom: typeof home.price === "number" ? home.price : null,
        heroImageUrl: cleanString(home.floorPlanImage) || cleanString(home.heroImage) || null,
        previewUrl: cleanString(home.floorPlanImage) || null,
        fileUrl: cleanString(home.floorPlanUrl) || null,
        communityRefs: [
          {
            id: cleanString(community.id),
            name: cleanString(community.name) || null,
            slug: cleanString(community.slug) || null,
          },
        ],
      });
      return;
    }
    if (typeof home.price === "number") {
      if (typeof existing.basePriceFrom !== "number" || home.price < existing.basePriceFrom) {
        existing.basePriceFrom = home.price;
      }
    }
    if (typeof existing.sqft !== "number" && typeof home.sqft === "number") {
      existing.sqft = home.sqft;
    }
    if (!cleanString(existing.heroImageUrl) && cleanString(home.floorPlanImage)) {
      existing.heroImageUrl = cleanString(home.floorPlanImage);
    }
    if (!cleanString(existing.fileUrl) && cleanString(home.floorPlanUrl)) {
      existing.fileUrl = cleanString(home.floorPlanUrl);
    }
  });

  return Array.from(map.values());
}

function deriveBuilderHeroImage({
  profile,
  bicDocs,
  homes,
  communities,
}: {
  profile: Awaited<ReturnType<typeof fetchBuilderProfileByRef>> | null;
  bicDocs: BuilderInCommunityRecord[];
  homes: PublicHome[];
  communities: PublicCommunity[];
}): string | null {
  const profileHero =
    cleanString((profile as { heroImageUrl?: unknown } | null)?.heroImageUrl) ||
    cleanString((profile as { coverImageUrl?: unknown } | null)?.coverImageUrl) ||
    null;
  if (profileHero) return profileHero;

  const bicHero = bicDocs
    .map((doc) => cleanString(doc.presentation?.heroImageUrl))
    .find(Boolean);
  if (bicHero) return bicHero;

  const homeHero = homes.map((home) => cleanString(home.heroImage)).find(Boolean);
  if (homeHero) return homeHero;

  const communityHero = communities.map((community) => cleanString(community.mapImage)).find(Boolean);
  return communityHero || null;
}

const getBuilderMetadataData = cache(async (builderId: string) => {
  const [homes, communities, builderProfile] = await Promise.all([
    fetchPublicHomesByBuilder(builderId, 24).catch(() => []),
    fetchPublicCommunitiesByBuilder(builderId, 18).catch(() => []),
    fetchBuilderProfileByRef(builderId).catch(() => null),
  ]);

  const builderName =
    cleanText(builderProfile?.builderName) ||
    cleanText(homes.find((home) => home.builder)?.builder) ||
    cleanText(communities.flatMap((community) => community.builders ?? []).find(Boolean)) ||
    (builderId ? titleCase(builderId) : "Builder");

  const canonicalParam =
    cleanText(builderProfile?.builderSlug) ||
    builderId ||
    cleanText(builderProfile?.companyId) ||
    "";

  const image =
    cleanText(builderProfile?.logoUrl) ||
    cleanText(homes.find((home) => home.heroImage)?.heroImage) ||
    cleanText(communities.find((community) => community.mapImage)?.mapImage) ||
    null;

  const description =
    cleanText(builderProfile?.description) ||
    (builderName
      ? `${builderName} listings, communities, and floor plans on BuildRootz.`
      : "Builder listings and communities on BuildRootz.");

  return {
    builderName,
    canonicalParam,
    image,
    description,
  };
});

export async function generateMetadata({
  params,
}: {
  params: BuilderParams | Promise<BuilderParams>;
}): Promise<Metadata> {
  const resolved = await params;
  const builderId = resolved?.builderId || "";
  const { builderName, canonicalParam, image, description } =
    await getBuilderMetadataData(builderId);
  const canonicalPath = sanitizeCanonicalPath(
    `/builder/${encodeURIComponent(canonicalParam || builderId)}`,
  );
  const title = builderName || "Builder";

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName: DEFAULT_SITE_NAME,
      images: image ? [{ url: image, alt: `${title} logo` }] : undefined,
    },
    twitter: {
      card: DEFAULT_TWITTER_CARD,
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function BuilderPage({
  params,
}: {
  params: BuilderParams | Promise<BuilderParams>;
}) {
  const resolved = await params;
  const builderId = resolved?.builderId || "";

  let homes: PublicHome[] = [];
  let communities: PublicCommunity[] = [];
  let floorPlans: BuilderFloorPlan[] = [];
  let builderCompanyId: string | undefined;
  let mappedBuilder: {
    id: string;
    slug: string;
    name: string;
    logoUrl?: string | null;
    description?: string;
    websiteUrl?: string | null;
    heroImageUrl?: string | null;
  } | null = null;
  let dataError: string | null = null;

  try {
    const [legacyHomes, legacyCommunities, builderProfile] = await Promise.all([
      fetchPublicHomesByBuilder(builderId, 300),
      fetchPublicCommunitiesByBuilder(builderId, 200),
      fetchBuilderProfileByRef(builderId),
    ]);

    const inferredCompanyId =
      cleanString(builderProfile?.companyId) ||
      legacyHomes
        .map((home) => cleanString(home.keepupBuilderId || home.companyId))
        .find((companyId) => isLikelyObjectId(companyId)) ||
      "";
    builderCompanyId = isLikelyObjectId(inferredCompanyId) ? inferredCompanyId : undefined;

    let bicDocs: BuilderInCommunityRecord[] = [];
    let planCatalog: PlanCatalogRecord[] = [];
    let offerings: CommunityPlanOfferingRecord[] = [];
    if (inferredCompanyId) {
      [bicDocs, planCatalog, offerings] = await Promise.all([
        fetchBuilderInCommunitiesByCompanyId(inferredCompanyId),
        fetchPlanCatalogByCompanyId(inferredCompanyId),
        fetchOfferingsByCompanyId(inferredCompanyId),
      ]);
    }

    const bicCommunityIds = Array.from(
      new Set(
        bicDocs
          .map((doc) => cleanString(doc.publicCommunityId))
          .filter(Boolean),
      ),
    );
    const offeringCommunityIds = Array.from(
      new Set(
        offerings
          .map((offering) => cleanString(offering.publicCommunityId))
          .filter(Boolean),
      ),
    );

    const baseCommunityById = new Map(
      legacyCommunities
        .map((community) => [cleanString(community.id), community] as const)
        .filter(([id]) => Boolean(id)),
    );
    const communityIdsToLoad =
      bicCommunityIds.length > 0 ? bicCommunityIds : offeringCommunityIds;
    const missingCommunityIds = communityIdsToLoad.filter((communityId) => !baseCommunityById.has(communityId));
    const loadedMissing = missingCommunityIds.length
      ? await Promise.all(missingCommunityIds.map((communityId) => fetchPublicCommunityById(communityId)))
      : [];
    loadedMissing.forEach((community) => {
      if (!community) return;
      const id = cleanString(community.id);
      if (!id) return;
      baseCommunityById.set(id, community);
    });

    const selectedCommunityIds =
      bicCommunityIds.length > 0
        ? bicCommunityIds
        : communityIdsToLoad.length > 0
          ? communityIdsToLoad
          : Array.from(baseCommunityById.keys());
    const selectedBaseCommunities = selectedCommunityIds
      .map((communityId) => baseCommunityById.get(communityId))
      .filter((community): community is PublicCommunity => Boolean(community));

    const companyHomes =
      inferredCompanyId && cleanString(inferredCompanyId) !== cleanString(builderId)
        ? await fetchPublicHomesByBuilder(inferredCompanyId, 300)
        : [];

    const builderNameCandidates = new Set<string>();
    [
      cleanString(builderProfile?.builderName),
      titleCase(builderId),
      ...bicDocs.map((doc) => cleanString(doc.builder?.name)),
      ...selectedBaseCommunities.flatMap((community) =>
        (community.builders || []).map((name) => cleanString(name)),
      ),
    ]
      .filter(Boolean)
      .forEach((value) => builderNameCandidates.add(normalizeMatchToken(value)));

    const builderSlugCandidates = new Set<string>();
    [
      cleanString(builderId).toLowerCase(),
      cleanString(builderProfile?.builderSlug).toLowerCase(),
      ...bicDocs.map((doc) => cleanString(doc.builder?.slug).toLowerCase()),
    ]
      .filter(Boolean)
      .forEach((value) => builderSlugCandidates.add(value));

    const builderCompanyCandidates = new Set<string>();
    [
      cleanString(inferredCompanyId).toLowerCase(),
      ...bicDocs.map((doc) => cleanString(doc.companyId).toLowerCase()),
    ]
      .filter(Boolean)
      .forEach((value) => builderCompanyCandidates.add(value));

    const homesFromSelectedCommunities = selectedBaseCommunities.length
      ? (
          await Promise.all(
            selectedBaseCommunities.map((community) =>
              fetchPublicHomesByCommunity(cleanString(community.id), 300).catch(() => []),
            ),
          )
        ).flat()
      : [];

    const fallbackCommunityHomes = homesFromSelectedCommunities.filter((home) =>
      homeBelongsToBuilder(home, {
        companyIds: builderCompanyCandidates,
        slugs: builderSlugCandidates,
        nameTokens: builderNameCandidates,
      }),
    );

    const combinedHomes = uniqById([...legacyHomes, ...companyHomes, ...fallbackCommunityHomes]);
    const activeHomes = combinedHomes.filter((home) => listingIsActivePublic(home));
    homes = activeHomes;

    const bicByCommunity = new Map(
      bicDocs
        .map((doc) => [cleanString(doc.publicCommunityId), doc] as const)
        .filter(([communityId]) => Boolean(communityId)),
    );
    const planCatalogById = new Map(
      planCatalog
        .map((plan) => [cleanString(plan.id), plan] as const)
        .filter(([planId]) => Boolean(planId)),
    );
    const offeringsByCommunity = new Map<string, CommunityPlanOfferingRecord[]>();
    offerings.forEach((offering) => {
      const communityId = cleanString(offering.publicCommunityId);
      if (!communityId) return;
      if (!offeringsByCommunity.has(communityId)) offeringsByCommunity.set(communityId, []);
      offeringsByCommunity.get(communityId)?.push(offering);
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(
        "[builder-page:data-sources]",
        JSON.stringify({
          builderRef: builderId,
          companyId: inferredCompanyId || null,
          activeHomes: activeHomes.length,
          communitiesSelected: selectedBaseCommunities.length,
          communitiesFromBic: bicCommunityIds.length,
          bicDocs: bicDocs.length,
          planCatalog: planCatalog.length,
          offerings: offerings.length,
        }),
      );
    }

    const mergedCommunities = selectedBaseCommunities.map((community) => {
      const publicCommunityId = cleanString(community.id);
      const bic = publicCommunityId ? bicByCommunity.get(publicCommunityId) || null : null;
      const merged = mergeCommunityBuilderView({ legacy: community, bic }) as PublicCommunity & {
        heroImageUrl?: string;
      };
      const communityOfferings = publicCommunityId
        ? offeringsByCommunity.get(publicCommunityId) || []
        : [];
      const offeringPlans = mapOfferingsToFloorPlansForCommunity(
        communityOfferings,
        planCatalogById,
        community,
      );
      const inferredPlans = inferCommunityPlansFromHomes(activeHomes, community);
      const legacyPlans = Array.isArray(community.floorPlans) ? community.floorPlans as BuilderFloorPlan[] : [];
      const resolvedPlans =
        offeringPlans.length > 0
          ? offeringPlans
          : legacyPlans.length > 0
            ? legacyPlans
            : inferredPlans;

      return {
        ...community,
        communityDetails: merged.communityDetails || community.communityDetails,
        description: cleanString(merged.description) || community.description,
        mapImage: cleanString(merged.heroImageUrl) || community.mapImage,
        modelAddress: merged.modelAddress || community.modelAddress,
        modelAddresses:
          (Array.isArray(merged.modelAddresses) && merged.modelAddresses.length
            ? merged.modelAddresses
            : community.modelAddresses) || [],
        floorPlans: resolvedPlans as PublicFloorPlan[],
      };
    });

    communities = uniqById(mergedCommunities);
    floorPlans = mergeFloorPlans(
      communities.flatMap((community) =>
        (Array.isArray(community.floorPlans) ? community.floorPlans : []) as BuilderFloorPlan[],
      ),
    );
    if (!floorPlans.length && offerings.length) {
      const fallbackPlans = offerings
        .map((offering, index) => {
          if (offering.isIncluded === false) return null;
          const planCatalogId = cleanString(offering.planCatalogId);
          if (!planCatalogId) return null;
          const catalog = planCatalogById.get(planCatalogId);
          if (!catalog) return null;
          const visibility = cleanString(offering.basePriceVisibility).toLowerCase();
          const basePriceFrom =
            visibility === "hidden"
              ? null
              : typeof offering.basePriceFrom === "number"
                ? offering.basePriceFrom
                : null;
          const communityRefId = cleanString(offering.publicCommunityId);
          const refCommunity = communityRefId ? baseCommunityById.get(communityRefId) : null;
          return {
            id: cleanString(offering.id) || `${cleanString(builderId)}-offering-${index + 1}`,
            name: cleanString(catalog.name) || cleanString(catalog.slug) || "Plan",
            communityId: communityRefId || null,
            communityName: cleanString(refCommunity?.name) || null,
            communitySlug: cleanString(refCommunity?.slug) || null,
            keepupFloorPlanId:
              cleanString(offering.keepupFloorPlanId) ||
              cleanString(catalog.keepupFloorPlanId) ||
              null,
            planCatalogId: planCatalogId || null,
            beds: typeof catalog.beds === "number" ? catalog.beds : null,
            baths: typeof catalog.baths === "number" ? catalog.baths : null,
            sqft: typeof catalog.sqft === "number" ? catalog.sqft : null,
            garage: parseGarageSpaces(catalog.garageSpaces, catalog.garage),
            stories: typeof catalog.stories === "number" ? catalog.stories : null,
            basePriceFrom,
            basePriceAsOf: cleanString(offering.basePriceAsOf) || null,
            detail: cleanString(offering.descriptionOverride) || cleanString(catalog.description) || null,
            heroImageUrl:
              cleanString(offering.primaryImageOverrideUrl) ||
              cleanString(catalog.primaryImageUrl) ||
              cleanString(catalog.images?.[0]?.url) ||
              null,
            previewUrl:
              cleanString(catalog.asset?.previewUrl) ||
              cleanString(catalog.previewUrl) ||
              null,
            fileUrl:
              cleanString(catalog.asset?.fileUrl) ||
              cleanString(catalog.fileUrl) ||
              null,
            communityRefs: communityRefId
              ? [
                  {
                    id: communityRefId,
                    name: cleanString(refCommunity?.name) || null,
                    slug: cleanString(refCommunity?.slug) || null,
                  },
                ]
              : [],
          } as BuilderFloorPlan;
        })
        .filter((plan): plan is BuilderFloorPlan => Boolean(plan));
      floorPlans = mergeFloorPlans(fallbackPlans);
    }

    const fallbackBuilderName =
      activeHomes.find((home) => cleanString(home.builder))?.builder ||
      communities.flatMap((community) => community.builders ?? []).find(Boolean) ||
      legacyHomes.find((home) => cleanString(home.builder))?.builder ||
      (builderId ? titleCase(builderId) : "Builder");

    const profileSlug = cleanString(builderProfile?.builderSlug);
    const inferredSlug =
      profileSlug ||
      cleanString(activeHomes.find((home) => home.builderSlug)?.builderSlug) ||
      builderId;

    const profileWebsite = normalizeExternalUrl(
      builderProfile?.websiteUrl || builderProfile?.website,
    );
    const builderHeroImage = deriveBuilderHeroImage({
      profile: builderProfile,
      bicDocs,
      homes: activeHomes,
      communities,
    });

    mappedBuilder = {
      id: cleanString(builderProfile?.companyId) || inferredSlug || builderId,
      slug: inferredSlug,
      name: cleanString(builderProfile?.builderName) || fallbackBuilderName,
      logoUrl: cleanString(builderProfile?.logoUrl) || null,
      description: cleanString(builderProfile?.description) || "",
      websiteUrl: profileWebsite,
      heroImageUrl: builderHeroImage,
    };
  } catch (err) {
    dataError = err instanceof Error ? err.message : "Builder data fetch failed";
  }

  if (!dataError && homes.length === 0 && communities.length === 0 && floorPlans.length === 0) {
    notFound();
  }

  const builderName =
    mappedBuilder?.name ||
    homes.find((home) => cleanString(home.builder))?.builder ||
    communities.flatMap((community) => community.builders ?? []).find(Boolean) ||
    (builderId ? titleCase(builderId) : "Builder");
  const heroImage =
    cleanString(mappedBuilder?.heroImageUrl) ||
    cleanString(homes.find((home) => home.heroImage)?.heroImage) ||
    cleanString(communities.find((community) => community.mapImage)?.mapImage) ||
    null;

  const builder = {
    id: mappedBuilder?.id || mappedBuilder?.slug || builderId,
    slug: mappedBuilder?.slug || builderId,
    name: builderName,
    logoUrl: mappedBuilder?.logoUrl || null,
    description: (mappedBuilder?.description || "").trim(),
    websiteUrl: mappedBuilder?.websiteUrl || null,
  };
  const builderInitials = getInitials(builder.name);

  const floorPlanSqftValues = floorPlans
    .map((plan) => (hasNumericValue(plan.sqft) ? plan.sqft : null))
    .filter((val): val is number => val !== null);
  const minSqft = floorPlanSqftValues.length ? Math.min(...floorPlanSqftValues) : null;
  const maxSqft = floorPlanSqftValues.length ? Math.max(...floorPlanSqftValues) : null;
  const sqftRange =
    minSqft !== null && maxSqft !== null
      ? minSqft === maxSqft
        ? `${minSqft.toLocaleString()} sqft`
        : `${minSqft.toLocaleString()} - ${maxSqft.toLocaleString()} sqft`
      : "-";

  const listingsCount = homes.length;
  const communitiesCount = communities.length;
  const floorPlansCount = floorPlans.length;
  const savedHomesCount = 0;

  const productTypes = Array.from(
    new Set(
      communities
        .flatMap((community) => community.productTypes ?? [])
        .map((value) => cleanString(value))
        .filter(Boolean),
    ),
  );

  const serviceAreas = Array.from(
    new Set(
      communities
        .map((community) => [cleanString(community.city), cleanString(community.state)].filter(Boolean).join(", "))
        .filter(Boolean),
    ),
  );
  const serviceAreaLabel = serviceAreas.slice(0, 3).join(", ");
  const serviceAreaSuffix =
    serviceAreas.length > 3 ? ` +${serviceAreas.length - 3} more` : "";
  const serviceAreaSummary = serviceAreaLabel
    ? `Service area: ${serviceAreaLabel}${serviceAreaSuffix}`
    : null;
  const builderWorkspaceSubjectId =
    cleanString(builderCompanyId) ||
    cleanString(builder.id) ||
    cleanString(builder.slug) ||
    cleanString(builderId);
  const builderWorkspaceSubtitle = [
    serviceAreaSummary,
    communitiesCount > 0 ? `${communitiesCount.toLocaleString()} communities` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className={styles.page}>
      <NavBar />
      <div className={styles.pageShell}>
        <div className={styles.layout}>
          <section className={styles.hero}>
            <SaveBuilderButton builderId={builder.id} builderName={builderName} />
            <div
              className={styles.heroMedia}
              style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
            >
              {!heroImage && <span className={styles.heroFallback}>Builder image coming soon</span>}
            </div>
            <div className={styles.heroContent}>
              <div className={styles.titleRow}>
                <div className={styles.logoContainer} aria-label={`${builder.name} logo`}>
                  {builder.logoUrl ? (
                    <img
                      className={styles.logoImage}
                      src={builder.logoUrl}
                      alt={`${builder.name} logo`}
                    />
                  ) : (
                    <div className={styles.logoFallback} aria-hidden="true">
                      {builderInitials}
                    </div>
                  )}
                </div>
                <div>
                  <h1 className={styles.title}>{builder.name}</h1>
                  {serviceAreaLabel ? (
                    <p className={styles.subtitle}>Service area: {serviceAreaLabel}{serviceAreaSuffix}</p>
                  ) : null}
                </div>
              </div>
              {builder.description ? (
                <div className={styles.descriptionBlock}>
                  <p className={styles.description}>{builder.description}</p>
                  {builder.description.length > 260 && (
                    <details className={styles.descriptionDetails}>
                      <summary className={styles.descriptionToggle}>Read more</summary>
                      <p className={styles.descriptionExpanded}>{builder.description}</p>
                    </details>
                  )}
                </div>
              ) : null}
              <div className={styles.actions}>
                <button className={styles.primary} type="button">
                  Contact builder
                </button>
                <button className={styles.ghost} type="button">
                  Schedule tour
                </button>
                <WorkspaceQueueButton
                  subjectType="builder"
                  subjectId={builderWorkspaceSubjectId}
                  title={builderName}
                  subtitle={builderWorkspaceSubtitle || undefined}
                  contextRefs={{ builderId: builderWorkspaceSubjectId }}
                  className={`${styles.ghost} ${styles.queueAction}`}
                  activeClassName={styles.queueActionActive}
                  queuedLabel="In Queue"
                  idleLabel="Queue"
                />
                {builder.websiteUrl ? (
                  <a
                    className={styles.ghost}
                    href={builder.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Builder website
                  </a>
                ) : (
                  <button
                    type="button"
                    className={`${styles.ghost} ${styles.ghostDisabled}`}
                    disabled
                  >
                    Builder website
                  </button>
                )}
              </div>
              <div className={styles.stats}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Floor plans</span>
                  <strong>{floorPlansCount.toLocaleString()}</strong>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>SQFT range</span>
                  <strong>{sqftRange}</strong>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Listings</span>
                  <strong>{listingsCount.toLocaleString()}</strong>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Communities</span>
                  <strong>{communitiesCount.toLocaleString()}</strong>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Saved Homes</span>
                  <strong>{savedHomesCount.toLocaleString()}</strong>
                </div>
              </div>
              <div className={styles.products}>
                <div className={styles.productsHeader}>
                  <span className={styles.productsLabel}>Products</span>
                  <span className={styles.productsHint}>Lot sizes offered</span>
                </div>
                <div className={styles.productsList}>
                  {productTypes.length ? (
                    productTypes.map((productType) => (
                      <span key={productType} className={styles.productTag}>
                        {productType}
                      </span>
                    ))
                  ) : (
                    <span className={styles.productTag}>Product types coming soon</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {dataError && (
            <div className={styles.panel}>
              <h3>Builder data unavailable</h3>
              <p className={styles.subtitle}>
                Could not load builder data from BuildRootz. Error: {dataError}
              </p>
            </div>
          )}

          {!dataError && homes.length === 0 && communities.length === 0 && (
            <div className={styles.panel}>
              <h3>No builder data yet</h3>
              <p className={styles.subtitle}>
                This builder has no published data in BuildRootz yet.
              </p>
            </div>
          )}

          {!dataError && (homes.length > 0 || communities.length > 0 || floorPlans.length > 0) && (
            <BuilderTabs
              homes={homes}
              communities={communities}
              builderSlug={builder.slug}
              builderCompanyId={builderCompanyId}
              floorPlans={floorPlans}
            />
          )}
        </div>
        <BuyerWorkspaceSidebar
          subjectType="builder"
          subjectId={builderWorkspaceSubjectId}
          title={builderName}
          subtitle={builderWorkspaceSubtitle || undefined}
          contextRefs={{ builderId: builderWorkspaceSubjectId }}
        />
      </div>
    </div>
  );
}
