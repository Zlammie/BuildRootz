import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NavBar from "../../components/NavBar";
import CommunityHeader from "../../components/community/CommunityHeader";
import CommunityOverviewCard from "../../components/community/CommunityOverviewCard";
import CommunityMapCard from "../../components/community/CommunityMapCard";
import BuilderSection from "../../components/community/BuilderSection";
import CommunityComparisonSection from "../../components/community/CommunityComparisonSection";
import communitySections from "../../components/community/CommunitySections.module.css";
import type {
  BuilderCardData,
  CommunityHeaderBadge,
  CommunityOverviewMetric,
  CommunitySchoolField,
  DetailStat,
} from "../../components/community/types";
import {
  fetchPublicCommunities,
  fetchPublicCommunityById,
  fetchPublicHomesByCommunity,
  fetchModelHomesByCommunity,
  fetchBuilderInCommunitiesForCommunity,
  fetchBuilderProfilesBySlugs,
  fetchBuilderProfilesByCompanyIds,
  fetchOfferingsForCommunity,
  fetchPlanCatalogByIds,
  fetchCommunityListingCounts,
} from "../../lib/publicData";
import type { PublicCommunity, PublicFloorPlan, PublicHome } from "../../types/public";
import type {
  CommunityPlanOfferingRecord,
  PlanCatalogRecord,
} from "../../lib/publicData";
import SaveCommunityButton from "./SaveCommunityButton";
import WorkspaceQueueButton from "../../components/workspace/WorkspaceQueueButton";
import BuyerWorkspaceSidebar from "../../components/workspace/BuyerWorkspaceSidebar";
import styles from "./page.module.css";
import { mergeCommunityBuilderView } from "../../../backend/services/builderInCommunityResolver";
import {
  buildBuilderSourcesFromBic,
  displayValue,
  resolveBuilderIdentity,
} from "../../../shared/communityDisplay";
import {
  AppSearchParams,
  DEFAULT_SITE_NAME,
  DEFAULT_TWITTER_CARD,
  buildRobotsMeta,
  cleanText,
  getSearchParamValue,
  sanitizeCanonicalPath,
} from "../../lib/seo";

type SearchParams = AppSearchParams & {
  communityId?: string | string[];
  communitySlug?: string | string[];
};

type Props = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

type BuilderRow = {
  builderId: string;
  companyId?: string;
  builderName: string;
  builderSlug?: string | null;
  builderLogoUrl?: string | null;
  activeListings?: number;
  availableLots?: number | string | null;
  contactLine?: string | null;
  schoolsLine?: string | null;
  hoaLine?: string | null;
  promotion?: string | null;
  amenities?: string[];
  productTypes?: string[];
  plans?: PublicFloorPlan[];
  sourceHomes?: PublicHome[];
  modelListing?: {
    address?: string | null;
    id?: string;
    price?: number | string | null;
    sqft?: number | string | null;
    lotSize?: string | number | null;
  };
};

type CommunityMergeInput = {
  description?: string;
  mapImage?: string;
  amenities?: string[];
  productTypes?: string[];
  communityDetails?: PublicCommunity["communityDetails"];
  modelAddress?: PublicCommunity["modelAddress"];
  modelAddresses?: PublicCommunity["modelAddresses"];
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const requestedCommunityId = getSearchParamValue(resolvedParams?.communityId);
  const requestedCommunitySlug = getSearchParamValue(resolvedParams?.communitySlug);
  const requestedRef =
    cleanText(requestedCommunitySlug) ||
    cleanText(requestedCommunityId) ||
    "";

  const requestedCommunity = requestedRef
    ? await fetchPublicCommunityById(requestedRef).catch(() => null)
    : null;
  const fallbackCommunity = requestedCommunity
    ? null
    : (await fetchPublicCommunities(1).catch(() => [])).at(0) || null;
  const community = requestedCommunity || fallbackCommunity;

  const canonicalParams = new URLSearchParams();
  if (cleanText(community?.slug)) {
    canonicalParams.set("communitySlug", cleanText(community?.slug) as string);
  } else if (cleanText(community?.id)) {
    canonicalParams.set("communityId", cleanText(community?.id) as string);
  } else if (cleanText(requestedCommunitySlug)) {
    canonicalParams.set("communitySlug", cleanText(requestedCommunitySlug) as string);
  } else if (cleanText(requestedCommunityId)) {
    canonicalParams.set("communityId", cleanText(requestedCommunityId) as string);
  }

  const canonicalPath = sanitizeCanonicalPath("/community", canonicalParams, [
    "communitySlug",
    "communityId",
  ]);
  const title = cleanText(community?.name) || "Community overview";
  const description =
    cleanText(community?.description) ||
    (title ? `${title} builders, amenities, and published listings on BuildRootz.` : "Community overview on BuildRootz.");
  const image = cleanText(community?.mapImage) || null;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: buildRobotsMeta({
      index: Boolean(requestedRef),
      follow: true,
    }),
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName: DEFAULT_SITE_NAME,
      images: image ? [{ url: image, alt: `${title} map` }] : undefined,
    },
    twitter: {
      card: DEFAULT_TWITTER_CARD,
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isLikelyObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value.trim());
}

function formatAddress(address?: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
} | null): string | null {
  if (!address) return null;
  const line = [address.street, address.city, address.state, address.zip]
    .map((item) => cleanString(item))
    .filter(Boolean)
    .join(", ");
  return line || null;
}

function formatHoa(hoaAmount: unknown, hoaFrequency: unknown, fallback?: string): string | null {
  if (typeof hoaAmount === "number" && Number.isFinite(hoaAmount)) {
    const suffix = cleanString(hoaFrequency);
    return `$${hoaAmount.toLocaleString()}${suffix ? ` ${suffix}` : ""}`;
  }
  if (typeof hoaAmount === "string" && hoaAmount.trim()) {
    return hoaAmount.trim();
  }
  if (fallback && fallback.trim()) {
    return fallback.trim();
  }
  return null;
}

function normalizeTaxRate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  if (value > 100) return null;
  return value > 1 ? value / 100 : value;
}

function formatMonthlyHoa(hoaMonthly: unknown, fallback?: string): string {
  if (typeof hoaMonthly === "number" && Number.isFinite(hoaMonthly) && hoaMonthly > 0) {
    return `$${hoaMonthly.toLocaleString()}/mo`;
  }
  const legacy = cleanString(fallback);
  return legacy || "-";
}

function formatTaxRateLabel(value: unknown, fallback?: string): string {
  const normalized = normalizeTaxRate(value);
  if (normalized !== null) {
    return `${(normalized * 100).toFixed(2)}%`;
  }
  const legacy = cleanString(fallback);
  return legacy || "-";
}

function formatPercentFromDecimal(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = Number((value * 100).toFixed(2));
  return `${percent}%`;
}

function formatCurrencyAmount(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return `$${value.toLocaleString()}`;
}

function normalizeFeeCadence(value: unknown): "monthly" | "annual" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("month")) return "monthly";
  if (normalized.includes("year") || normalized.includes("annual")) return "annual";
  return null;
}

function formatFeeWithCadence(amount: unknown, cadenceValue: unknown): string {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return "-";
  const cadence = normalizeFeeCadence(cadenceValue);
  if (cadence === "monthly") return `$${amount.toLocaleString()}/mo`;
  if (cadence === "annual") return `$${amount.toLocaleString()}/yr`;
  return `$${amount.toLocaleString()}`;
}

function formatFlag(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "-";
}

function toSchoolsLine(schools: Record<string, unknown> | null | undefined): string | null {
  if (!schools) return null;
  const district = cleanString(schools.district);
  const text = cleanString(schools.text);
  const line = [
    cleanString(schools.elementary),
    cleanString(schools.middle),
    cleanString(schools.high),
  ]
    .filter(Boolean)
    .join(" / ");
  return line || district || text || null;
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

function inferCommunityPlansFromHomes(
  homes: PublicHome[],
  community: PublicCommunity,
): PublicFloorPlan[] {
  const map = new Map<string, PublicFloorPlan>();
  homes.forEach((home, index) => {
    const name = cleanString(home.planName) || cleanString(home.title);
    if (!name) return;
    const key = name.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        id: cleanString(home.planNumber) || `${cleanString(community.id)}-home-plan-${index + 1}`,
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
  });
  return Array.from(map.values());
}

function formatCount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) return numeric.toLocaleString();
  return displayValue(value);
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString()}`;
}

function formatRange(values: Array<number | null | undefined>, formatter: (value: number) => string): string {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return "—";
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (min === max) return formatter(min);
  return `${formatter(min)} - ${formatter(max)}`;
}

function averageOf(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

type CommunityPlanView = PublicFloorPlan & {
  stories?: number | null;
  primaryImageUrl?: string | null;
  previewUrl?: string | null;
  fileUrl?: string | null;
};

function displayPlanNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function toPlanGroupKey(plan: CommunityPlanView): string {
  const planCatalogId = cleanString(plan.planCatalogId);
  if (planCatalogId) return `catalog:${planCatalogId}`;
  const keepupFloorPlanId = cleanString(plan.keepupFloorPlanId);
  if (keepupFloorPlanId) return `keepup:${keepupFloorPlanId}`;
  const name = cleanString(plan.name).toLowerCase();
  if (name) return `name:${name}`;
  return `id:${cleanString(plan.id)}`;
}

function minNumber(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  const aOk = typeof a === "number" && Number.isFinite(a);
  const bOk = typeof b === "number" && Number.isFinite(b);
  if (aOk && bOk) return Math.min(a as number, b as number);
  if (aOk) return a as number;
  if (bOk) return b as number;
  return null;
}

function mergePlanViews(plans: CommunityPlanView[]): CommunityPlanView[] {
  const grouped = new Map<string, CommunityPlanView>();
  plans.forEach((plan) => {
    const key = toPlanGroupKey(plan);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...plan });
      return;
    }

    existing.basePriceFrom = minNumber(existing.basePriceFrom, plan.basePriceFrom);
    if (typeof existing.beds !== "number" && typeof plan.beds === "number") existing.beds = plan.beds;
    if (typeof existing.baths !== "number" && typeof plan.baths === "number") existing.baths = plan.baths;
    if (typeof existing.sqft !== "number" && typeof plan.sqft === "number") existing.sqft = plan.sqft;
    if (typeof existing.garage !== "number" && typeof plan.garage === "number") existing.garage = plan.garage;
    if (typeof existing.stories !== "number" && typeof plan.stories === "number") existing.stories = plan.stories;
    if (!cleanString(existing.previewUrl) && cleanString(plan.previewUrl)) existing.previewUrl = plan.previewUrl;
    if (!cleanString(existing.fileUrl) && cleanString(plan.fileUrl)) existing.fileUrl = plan.fileUrl;
    if (!cleanString(existing.primaryImageUrl) && cleanString(plan.primaryImageUrl)) {
      existing.primaryImageUrl = plan.primaryImageUrl;
    }
    if (!cleanString(existing.name) && cleanString(plan.name)) existing.name = plan.name;
    if (!cleanString(existing.planCatalogId) && cleanString(plan.planCatalogId)) existing.planCatalogId = plan.planCatalogId;
    if (!cleanString(existing.keepupFloorPlanId) && cleanString(plan.keepupFloorPlanId)) {
      existing.keepupFloorPlanId = plan.keepupFloorPlanId;
    }
  });
  return Array.from(grouped.values());
}

function formatPlanSpecsLine(plan: CommunityPlanView): string {
  const segments: string[] = [];
  if (typeof plan.beds === "number" && Number.isFinite(plan.beds)) {
    segments.push(`${displayPlanNumber(plan.beds)} bd`);
  }
  if (typeof plan.baths === "number" && Number.isFinite(plan.baths)) {
    segments.push(`${displayPlanNumber(plan.baths)} ba`);
  }
  if (typeof plan.sqft === "number" && Number.isFinite(plan.sqft)) {
    segments.push(`${Math.round(plan.sqft).toLocaleString()} sqft`);
  }
  if (typeof plan.garage === "number" && Number.isFinite(plan.garage) && plan.garage > 0) {
    segments.push(`${displayPlanNumber(plan.garage)} car`);
  }
  if (typeof plan.stories === "number" && Number.isFinite(plan.stories) && plan.stories > 0) {
    const storyCount = displayPlanNumber(plan.stories);
    segments.push(`${storyCount} ${plan.stories === 1 ? "story" : "stories"}`);
  }
  return segments.join(" · ") || "Specs coming soon";
}

function isQuickMoveInStatus(status: unknown): boolean {
  const normalized = cleanString(status).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("inventory") ||
    normalized.includes("quick move") ||
    normalized.includes("spec")
  );
}

function mapCommunityPlansFromOfferings(
  offerings: CommunityPlanOfferingRecord[],
  planCatalogById: Map<string, PlanCatalogRecord>,
  community: PublicCommunity,
): PublicFloorPlan[] {
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
        primaryImageUrl:
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
      } as PublicFloorPlan;
    })
    .filter((plan): plan is PublicFloorPlan => Boolean(plan));
}

async function buildCommunityBuilderRows({
  community,
  homes,
  modelHomes,
}: {
  community: PublicCommunity;
  homes: PublicHome[];
  modelHomes: PublicHome[];
}): Promise<BuilderRow[]> {
  const communityId = cleanString(community.id);
  const bicDocs = communityId ? await fetchBuilderInCommunitiesForCommunity(communityId) : [];
  const builderSources = buildBuilderSourcesFromBic({ bicDocs, homes }) as Array<{
    builderId: string;
    companyId?: string | null;
    builderName?: string | null;
    builderSlug?: string | null;
    bicDoc?: {
      builder?: {
        name?: string;
        slug?: string;
      };
      presentation?: {
        logoUrl?: string;
      };
    } | null;
    sourceHomes?: PublicHome[];
  }>;
  if (!builderSources.length) {
    return [];
  }

  const modelHomesByCompanyId = new Map<string, PublicHome>();
  [...modelHomes, ...homes]
    .filter((home) => cleanString(home.status).toLowerCase() === "model")
    .forEach((home) => {
      const companyId = cleanString(home.keepupBuilderId) || cleanString(home.companyId);
      if (!companyId || modelHomesByCompanyId.has(companyId)) return;
      modelHomesByCompanyId.set(companyId, home);
    });

  const bicByCompanyId = new Map(
    bicDocs
      .map((doc) => [cleanString(doc.companyId), doc] as const)
      .filter(([companyId]) => Boolean(companyId)),
  );

  const slugsToResolve = builderSources
    .filter((source) => !cleanString(source.companyId) && cleanString(source.builderSlug))
    .map((source) => cleanString(source.builderSlug))
    .filter(Boolean);

  const profileBySlug = new Map<string, NonNullable<Awaited<ReturnType<typeof fetchBuilderProfilesBySlugs>>[number]>>();
  if (slugsToResolve.length) {
    const profiles = await fetchBuilderProfilesBySlugs(slugsToResolve);
    profiles.forEach((profile) => {
      const slug = cleanString(profile.builderSlug);
      if (slug) {
        profileBySlug.set(slug, profile);
      }
    });
  }

  const companyIds = Array.from(
    new Set(
      builderSources
        .map((source) => cleanString(source.companyId))
        .filter(Boolean),
    ),
  );
  const companyProfiles = companyIds.length
    ? await fetchBuilderProfilesByCompanyIds(companyIds)
    : [];
  const profileByCompanyId = new Map(
    companyProfiles
      .map((profile) => [cleanString(profile.companyId), profile] as const)
      .filter(([companyId]) => Boolean(companyId)),
  );

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[community-page:bic]",
      JSON.stringify({
        publicCommunityId: communityId,
        builders: builderSources.length,
        companyIds: companyIds.length,
        bicDocs: bicDocs.length,
      }),
    );
  }

  const fallbackDetails = community.communityDetails || undefined;
  const rows: BuilderRow[] = builderSources.map((source) => {
    const slug = cleanString(source.builderSlug);
    const companyId = cleanString(source.companyId);
    const profile =
      (companyId && profileByCompanyId.get(companyId)) ||
      (slug && profileBySlug.get(slug)) ||
      null;
    const bicDoc =
      (companyId ? bicByCompanyId.get(companyId) : null) ||
      source.bicDoc ||
      null;
    const resolvedIdentity = resolveBuilderIdentity({
      groupBuilderName: source.builderName,
      groupBuilderSlug: source.builderSlug,
      profileBuilderName: profile?.builderName,
      profileBuilderSlug: profile?.builderSlug,
      profileLogoUrl: profile?.logoUrl,
      bicBuilderName: bicDoc?.builder?.name,
      bicBuilderSlug: bicDoc?.builder?.slug,
      bicLogoUrl: (bicDoc?.presentation as { logoUrl?: unknown } | undefined)?.logoUrl,
      unknownBuilderName: "Unknown builder",
    }) as { name: string; slug: string | null; logoUrl: string | null };

    const legacyView: CommunityMergeInput = {
      description: community.description,
      mapImage: community.mapImage,
      communityDetails: fallbackDetails,
      modelAddress: community.modelAddress,
      modelAddresses: community.modelAddresses,
    };
    const merged = mergeCommunityBuilderView({ legacy: legacyView, bic: bicDoc }) as {
      communityDetails?: PublicCommunity["communityDetails"];
      description?: string;
      promotion?: string;
      amenities?: string[];
      productTypes?: string[];
      modelAddress?: PublicCommunity["modelAddress"] | null;
      modelAddresses?: PublicCommunity["modelAddresses"];
    };
    const details = merged.communityDetails || fallbackDetails || undefined;
    const primaryContact = details?.primaryContact || undefined;
    const schoolsLine = toSchoolsLine(details?.schools);
    const hoaLine = formatHoa(details?.hoaAmount, details?.hoaFrequency, community.hoa);
    const contactLine = [primaryContact?.name, primaryContact?.phone, primaryContact?.email]
      .map((item) => cleanString(item))
      .filter(Boolean)
      .join(" | ");
    const modelHome = companyId ? modelHomesByCompanyId.get(companyId) : undefined;
    const mergedModelAddress = formatAddress((merged.modelAddress as PublicCommunity["modelAddress"]) || undefined);
    const modelAddress = modelHome
      ? [modelHome.address, modelHome.city, modelHome.state, modelHome.postalCode]
          .map((item) => cleanString(item))
          .filter(Boolean)
          .join(", ")
      : mergedModelAddress;

    return {
      builderId: cleanString(source.builderId),
      companyId: companyId || undefined,
      builderName: resolvedIdentity.name,
      builderSlug: resolvedIdentity.slug,
      builderLogoUrl: resolvedIdentity.logoUrl,
      availableLots: details?.totalLots ?? null,
      contactLine: contactLine || null,
      schoolsLine,
      hoaLine,
      promotion: cleanString(merged.promotion) || cleanString(merged.description) || null,
      amenities: Array.isArray(merged.amenities)
        ? merged.amenities.map((item) => cleanString(item)).filter(Boolean)
        : [],
      productTypes: Array.isArray(merged.productTypes)
        ? merged.productTypes.map((item) => cleanString(item)).filter(Boolean)
        : [],
      sourceHomes: Array.isArray(source.sourceHomes) ? source.sourceHomes : [],
      modelListing:
        modelAddress || modelHome
          ? {
              address: modelAddress || null,
              id: modelHome?.id,
              price: modelHome?.price ?? null,
              sqft: modelHome?.sqft ?? null,
              lotSize: null,
            }
          : undefined,
    };
  });

  return rows;
}

export default async function CommunityPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const requestedCommunityId = getSearchParamValue(resolvedParams?.communityId);
  const requestedCommunitySlug = getSearchParamValue(resolvedParams?.communitySlug);

  let community: PublicCommunity | null = null;
  let modelHomes: PublicHome[] = [];
  let communityHomes: PublicHome[] = [];
  let communityPlans: PublicFloorPlan[] = [];
  let builderModels: BuilderRow[] = [];
  let dataError: string | null = null;

  try {
    const incomingCommunityRef = cleanString(requestedCommunityId) || cleanString(requestedCommunitySlug);
    const requested =
      incomingCommunityRef ? await fetchPublicCommunityById(incomingCommunityRef) : null;
    const fallbackCommunities = requested ? [] : await fetchPublicCommunities(1);
    community = requested ?? fallbackCommunities[0] ?? null;

    if (!community) {
      if (incomingCommunityRef) notFound();
      dataError = "No community is available in BuildRootz yet.";
    } else {
      const activeCommunity = community;
      const communityMatchRef = cleanString(activeCommunity.id) || cleanString(activeCommunity.slug);
      const [homesForCommunity, modelHomesForCommunity] = await Promise.all([
        communityMatchRef ? fetchPublicHomesByCommunity(communityMatchRef, 300) : Promise.resolve([]),
        communityMatchRef ? fetchModelHomesByCommunity(communityMatchRef) : Promise.resolve([]),
      ]);
      communityHomes = homesForCommunity;
      modelHomes = modelHomesForCommunity;
      builderModels = await buildCommunityBuilderRows({
        community: activeCommunity,
        homes: homesForCommunity,
        modelHomes,
      });

      const builderCompanyIds = Array.from(
        new Set(
          builderModels
            .map((row) => cleanString(row.companyId || row.builderId))
            .filter((companyId) => isLikelyObjectId(companyId)),
        ),
      );

      const [offerings, listingCounts] = await Promise.all([
        cleanString(activeCommunity.id) && builderCompanyIds.length
          ? fetchOfferingsForCommunity(cleanString(activeCommunity.id), builderCompanyIds)
          : Promise.resolve([]),
        cleanString(activeCommunity.id) && builderCompanyIds.length
          ? fetchCommunityListingCounts(cleanString(activeCommunity.id), builderCompanyIds)
          : Promise.resolve({} as Record<string, number>),
      ]);

      const planCatalogIds = Array.from(
        new Set(
          offerings
            .map((offering) => cleanString(offering.planCatalogId))
            .filter(Boolean),
        ),
      );
      const planCatalog = planCatalogIds.length
        ? await fetchPlanCatalogByIds(planCatalogIds)
        : [];
      const planCatalogById = new Map(
        planCatalog
          .map((plan) => [cleanString(plan.id), plan] as const)
          .filter(([planId]) => Boolean(planId)),
      );
      const offeringPlans = mapCommunityPlansFromOfferings(offerings, planCatalogById, activeCommunity);
      const offeringSummaryByCompany = new Map<string, PublicFloorPlan[]>();
      offerings.forEach((offering) => {
        const companyId = cleanString(offering.companyId);
        if (!companyId) return;
        if (!offeringSummaryByCompany.has(companyId)) {
          offeringSummaryByCompany.set(companyId, []);
        }
        const plansForBuilder = mapCommunityPlansFromOfferings([offering], planCatalogById, activeCommunity);
        if (!plansForBuilder.length) return;
        offeringSummaryByCompany.get(companyId)?.push(...plansForBuilder);
      });
      const listingCountsNormalized = new Map(
        Object.entries(listingCounts).map(([companyId, count]) => [companyId.toLowerCase(), count] as const),
      );

      builderModels = builderModels
        .map((row) => {
        const companyId = cleanString(row.companyId || row.builderId);
        const plansFromOfferings = companyId ? offeringSummaryByCompany.get(companyId) || [] : [];
        const plansFromHomes = inferCommunityPlansFromHomes(row.sourceHomes || [], activeCommunity);
        const plans =
          plansFromOfferings.length > 0
            ? plansFromOfferings
            : plansFromHomes;
        return {
          ...row,
          activeListings: listingCountsNormalized.get(companyId.toLowerCase()) || 0,
          plans,
        };
      })
        .sort((a, b) => {
          const aInventory = typeof a.activeListings === "number" && a.activeListings > 0 ? 0 : 1;
          const bInventory = typeof b.activeListings === "number" && b.activeListings > 0 ? 0 : 1;
          if (aInventory !== bInventory) return aInventory - bInventory;
          return cleanString(a.builderName || "Unknown builder").localeCompare(
            cleanString(b.builderName || "Unknown builder"),
          );
        });

      const inferredPlans = inferCommunityPlansFromHomes(homesForCommunity, activeCommunity);
      communityPlans =
        offeringPlans.length > 0
          ? offeringPlans
          : (activeCommunity.floorPlans && activeCommunity.floorPlans.length > 0 ? activeCommunity.floorPlans : inferredPlans);

      if (process.env.NODE_ENV !== "production") {
        console.log(
          "[community-page:plans]",
          JSON.stringify({
            publicCommunityId: cleanString(activeCommunity.id) || null,
            offeringCompanyIds: builderCompanyIds.length,
            offerings: offerings.length,
            planCatalog: planCatalog.length,
            offeringPlans: offeringPlans.length,
            listingCountsBuilders: Object.keys(listingCounts || {}).length,
            fallbackSource: offeringPlans.length
              ? "offerings"
              : activeCommunity.floorPlans && activeCommunity.floorPlans.length > 0
                ? "legacy-community-floorPlans"
                : "homes-inference",
          }),
        );
      }
    }
  } catch (err) {
    dataError = err instanceof Error ? err.message : "Unknown error loading community";
  }

  const location = [community?.city, community?.state].filter(Boolean).join(", ") || "Location coming soon";
  const amenities =
    Array.isArray(community?.amenities) && community.amenities.length
      ? community.amenities
      : Array.from(
          new Set(
            builderModels
              .flatMap((builder) => builder.amenities ?? [])
              .map((item) => cleanString(item))
              .filter(Boolean),
          ),
        );
  const productTypes =
    Array.isArray(community?.productTypes) && community.productTypes.length
      ? community.productTypes
      : Array.from(
          new Set(
            builderModels
              .flatMap((builder) => builder.productTypes ?? [])
              .map((item) => cleanString(item))
              .filter(Boolean),
          ),
        );
  const communityId = community?.id || null;
  const communityWorkspaceSubjectId =
    cleanString(community?.id) ||
    cleanString(community?.slug) ||
    cleanString(requestedCommunitySlug) ||
    cleanString(requestedCommunityId) ||
    "";
  const communityWorkspaceSubtitle = [
    location !== "Location coming soon" ? location : null,
    builderModels.length ? `${builderModels.length.toLocaleString()} builders` : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const hoaLabel = formatMonthlyHoa(community?.hoaMonthly, community?.hoa);
  const taxRateLabel = formatTaxRateLabel(community?.taxRate, community?.taxes);
  const pidFeeLabel = formatFeeWithCadence(community?.pidFee, community?.pidFeeFrequency);
  const mudTaxRateLabel = formatPercentFromDecimal(community?.mudTaxRate);
  const mudLegacyAmountLabel = formatCurrencyAmount(community?.mudFeeAmount);
  const mudRateValue = mudTaxRateLabel || mudLegacyAmountLabel || "-";
  const mudRateLabel = mudTaxRateLabel ? "MUD" : mudLegacyAmountLabel ? "MUD (legacy)" : "MUD";
  const taxDistrictLabel = cleanString(community?.taxDistrict) || "-";
  const hoaIncludesLabel =
    Array.isArray(community?.hoaIncludes) && community.hoaIncludes.length
      ? community.hoaIncludes.join(", ")
      : "-";

  const quickMoveInHomes = communityHomes.filter((home) => {
    return isQuickMoveInStatus(home.status);
  });

  const headerBadges: CommunityHeaderBadge[] = [
    { label: "Total Builders", value: formatCount(builderModels.length) },
    { label: "Total Plans", value: formatCount(communityPlans.length) },
    { label: "Quick Move-In Homes", value: formatCount(quickMoveInHomes.length) },
  ];

  const secondaryOverviewMetrics: CommunityOverviewMetric[] = [
    { label: "Builder count", value: formatCount(builderModels.length) },
    { label: "Plan count", value: formatCount(communityPlans.length) },
    { label: "Quick Move-In homes", value: formatCount(quickMoveInHomes.length) },
  ];
  const primaryOverviewMetrics: CommunityOverviewMetric[] = [
    {
      label: "Price range",
      value: formatRange(
        communityHomes.map((home) => (typeof home.price === "number" ? home.price : null)),
        (value) => `$${value.toLocaleString()}`,
      ),
    },
    {
      label: "Sqft range",
      value: formatRange(
        communityHomes.map((home) => (typeof home.sqft === "number" ? home.sqft : null)),
        (value) => `${value.toLocaleString()} sqft`,
      ),
    },
  ];
  const lotSizeOptions = productTypes;

  const builderCards: BuilderCardData[] = builderModels.map((builder) => {
    const plans = mergePlanViews(
      (Array.isArray(builder.plans) ? builder.plans : []) as CommunityPlanView[],
    );
    const sourceHomes = Array.isArray(builder.sourceHomes) ? builder.sourceHomes : [];
    const inventoryHomes = sourceHomes.filter((home) => isQuickMoveInStatus(home.status));
    const avgPrice = averageOf(
      plans.map((plan) => (typeof plan.basePriceFrom === "number" ? plan.basePriceFrom : null)),
    );
    const avgSqft = averageOf(
      plans.map((plan) => (typeof plan.sqft === "number" ? plan.sqft : null)),
    );

    const planRows = plans.map((plan, planIndex) => {
      const planMedia = plan as CommunityPlanView;
      const garageCount =
        typeof planMedia.garage === "number" && Number.isFinite(planMedia.garage)
          ? planMedia.garage
          : null;
      const storyCount =
        typeof planMedia.stories === "number" && Number.isFinite(planMedia.stories)
          ? planMedia.stories
          : null;
      return {
          id: cleanString(plan.id) || `${builder.builderId}-plan-${planIndex + 1}`,
          name: cleanString(plan.name) || "Plan",
          specs: formatPlanSpecsLine(planMedia),
          fromPrice:
            typeof plan.basePriceFrom === "number"
              ? `From $${plan.basePriceFrom.toLocaleString()}`
              : "From —",
          beds:
            typeof plan.beds === "number" && Number.isFinite(plan.beds)
              ? plan.beds
              : null,
          baths:
            typeof plan.baths === "number" && Number.isFinite(plan.baths)
              ? plan.baths
              : null,
          sqft:
            typeof plan.sqft === "number" && Number.isFinite(plan.sqft)
              ? plan.sqft
              : null,
          basePriceFrom:
            typeof plan.basePriceFrom === "number" && Number.isFinite(plan.basePriceFrom)
              ? plan.basePriceFrom
              : null,
          garageCount,
          stories: storyCount,
          heroImageUrl: cleanString(planMedia.primaryImageUrl) || null,
          previewUrl: cleanString(planMedia.previewUrl) || null,
          fileUrl: cleanString(planMedia.fileUrl) || null,
          planCatalogId: cleanString(plan.planCatalogId) || null,
          keepupFloorPlanId: cleanString(plan.keepupFloorPlanId) || null,
        };
      });

    return {
      id: cleanString(builder.builderId) || cleanString(builder.companyId) || "unknown-builder",
      name: displayValue(cleanString(builder.builderName) || "Unknown builder"),
      logoUrl: cleanString(builder.builderLogoUrl) || null,
      slug: cleanString(builder.builderSlug) || null,
      modelAddress: cleanString(builder.modelListing?.address) || null,
      community: {
        name: cleanString(community?.name) || null,
        slug: cleanString(community?.slug) || null,
        city: cleanString(community?.city) || null,
        state: cleanString(community?.state) || null,
        mapImage: cleanString(community?.mapImage) || null,
      },
      metrics: [
        { label: "Lots", value: displayValue(formatCount(builder.availableLots)) },
        { label: "Quick Move-In Homes", value: formatCount(inventoryHomes.length) },
        { label: "Plans Offered", value: formatCount(plans.length || null) },
        { label: "Avg Price", value: avgPrice !== null ? formatCurrency(avgPrice) : "—" },
        { label: "Avg Sqft", value: avgSqft !== null ? `${Math.round(avgSqft).toLocaleString()} sqft` : "—" },
        {
          label: "Lot Size",
          value:
            Array.isArray(builder.productTypes) && builder.productTypes.length
              ? builder.productTypes.join(", ")
              : "—",
        },
      ],
      plans: planRows,
      inventoryHomes,
    };
  });
  const builderSectionCommunityId =
    cleanString(community?.id) || cleanString(community?.slug) || "unknown";

  const schoolSource =
    ((community?.communityDetails?.schools as Record<string, unknown> | null) || null) ??
    ((community?.schools as Record<string, unknown> | null) || null);
  const schoolsDistrict =
    cleanString(schoolSource?.district) || cleanString(schoolSource?.isd) || null;
  const schoolFields: CommunitySchoolField[] = [
    {
      label: "Elementary School",
      value: cleanString(schoolSource?.elementary) || "Not listed yet",
    },
    {
      label: "Middle School",
      value: cleanString(schoolSource?.middle) || "Not listed yet",
    },
    {
      label: "High School",
      value: cleanString(schoolSource?.high) || "Not listed yet",
    },
  ];

  const feeStats: DetailStat[] = [
    { label: "HOA", value: hoaLabel },
    { label: "Tax rate", value: taxRateLabel },
    { label: "PID", value: formatFlag(community?.pid) },
    { label: "PID fee", value: pidFeeLabel },
    { label: mudRateLabel, value: mudRateValue },
    { label: "MUD district", value: formatFlag(community?.mud) },
    { label: "Tax district", value: taxDistrictLabel },
    { label: "HOA includes", value: hoaIncludesLabel },
  ];

  return (
    <div className={styles.page}>
      <NavBar />
      <div className={styles.pageShell}>
        <div className={styles.layout}>
          <CommunityHeader
            title={community?.name || "Community overview"}
            subtitle={location}
            badges={headerBadges}
            actions={
              communityWorkspaceSubjectId ? (
                <>
                  <WorkspaceQueueButton
                    subjectType="community"
                    subjectId={communityWorkspaceSubjectId}
                    title={community?.name || "Community overview"}
                    subtitle={communityWorkspaceSubtitle || undefined}
                    contextRefs={communityId ? { communityId: cleanString(communityId) } : undefined}
                    className={styles.queueButton}
                    activeClassName={styles.queueButtonActive}
                    queuedLabel="In Queue"
                    idleLabel="Queue"
                  />
                  {communityId ? <SaveCommunityButton communityId={communityId} /> : null}
                </>
              ) : communityId ? (
                <SaveCommunityButton communityId={communityId} />
              ) : null
            }
          />

          {dataError && (
            <div className={styles.panel}>
              <h3>Community data unavailable</h3>
              <p className={styles.subtitle}>Could not load this community. Error: {dataError}</p>
            </div>
          )}

          {!community && (
            <div className={styles.panel}>
              <h3>No community published</h3>
              <p className={styles.subtitle}>This community is not available in BuildRootz.</p>
            </div>
          )}

          {community && (
            <>
              <div className={communitySections.topGrid}>
                <CommunityOverviewCard
                  primaryMetrics={primaryOverviewMetrics}
                  secondaryMetrics={secondaryOverviewMetrics}
                  lotSizeOptions={lotSizeOptions}
                  feeStats={feeStats}
                  amenities={amenities}
                  schools={schoolFields}
                  schoolsDistrict={schoolsDistrict}
                />
                <CommunityMapCard
                  name={community.name || "Community"}
                  locationLabel={location}
                  lat={community.location?.lat ?? null}
                  lng={community.location?.lng ?? null}
                />
              </div>

              <BuilderSection communityId={builderSectionCommunityId} builders={builderCards} />
              <CommunityComparisonSection builders={builderCards} />
            </>
          )}
        </div>
        {communityWorkspaceSubjectId ? (
          <BuyerWorkspaceSidebar
            subjectType="community"
            subjectId={communityWorkspaceSubjectId}
            title={community?.name || "Community overview"}
            subtitle={communityWorkspaceSubtitle || undefined}
            contextRefs={communityId ? { communityId: cleanString(communityId) } : undefined}
          />
        ) : null}
      </div>
    </div>
  );
}

