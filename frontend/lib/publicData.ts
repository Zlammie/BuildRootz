import { ObjectId, type Document, type WithId, type Collection, type Db } from "mongodb";
import { getDb } from "./mongodb";
import type { PublicCommunity, PublicHome, PublicHomeStatus } from "../types/public";
import { withCommunityDetails } from "../../shared/communityDetails";
import { mergeBuilderInCommunityIntoPublicCommunity } from "../../shared/publicCommunityView";
import { normalizePromo, normalizePromoMode } from "../../shared/promo";

const HOME_COLLECTION_CANDIDATES = [
  "PublicHome",
  "PublicHomes",
  "publichomes",
  "publichome",
  "PublicHome_v2",
];

const COMMUNITY_COLLECTION_CANDIDATES = [
  "PublicCommunity",
  "PublicCommunities",
  "publiccommunities",
  "publiccommunity",
];

const BUILDER_PROFILE_COLLECTION_CANDIDATES = [
  "BuilderProfile",
  "BuilderProfiles",
  "builderprofile",
  "builderprofiles",
];

const BUILDER_IN_COMMUNITY_COLLECTION_CANDIDATES = [
  "BuilderInCommunity",
  "BuilderInCommunities",
  "builderincommunity",
  "builderincommunities",
];

const PLAN_CATALOG_COLLECTION_CANDIDATES = [
  "PlanCatalog",
  "PlanCatalogs",
  "plancatalog",
  "plancatalogs",
];

const COMMUNITY_PLAN_OFFERING_COLLECTION_CANDIDATES = [
  "CommunityPlanOffering",
  "CommunityPlanOfferings",
  "communityplanoffering",
  "communityplanofferings",
];

const STATUS_MAP: Record<string, PublicHomeStatus> = {
  available: "available",
  active: "available",
  inventory: "inventory",
  spec: "inventory",
  "quick move-in": "inventory",
  "coming soon": "comingSoon",
  comingsoon: "comingSoon",
  coming_soon: "comingSoon",
  model: "model",
  modelhome: "model",
  "model home": "model",
};

let collectionNamesCache: string[] | null = null;

const assetBase = (
  process.env.BUILDROOTZ_ASSET_BASE ||
  process.env.BUILDROOTZ_UPLOAD_BASE_URL ||
  process.env.ASSET_BASE ||
  process.env.UPLOAD_BASE_URL ||
  ""
).replace(/\/$/, "");

function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/uploads/")) {
    return trimmed;
  }
  if (trimmed.startsWith("uploads/")) {
    return `/${trimmed}`;
  }
  // Absolute URL: optionally rewrite uploads to our configured asset base for proxying
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith("/uploads/")) {
        // Prefer relative /uploads so Next rewrite proxies it and avoids CORP/CORS
        return `/uploads${parsed.pathname.replace("/uploads", "")}${parsed.search ?? ""}`;
      }
      if (assetBase) {
        return `${assetBase}${parsed.pathname}${parsed.search ?? ""}`;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }
  if (!assetBase) return trimmed;
  return `${assetBase}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

async function getCollectionNames(db: Db): Promise<string[]> {
  if (collectionNamesCache) return collectionNamesCache;
  const names = await db.listCollections().toArray();
  collectionNamesCache = names.map((c) => c.name);
  return collectionNamesCache;
}

export async function resolveCollection(db: Db, candidates: string[]): Promise<Collection<Document>> {
  const names = await getCollectionNames(db);
  const found = candidates.find((name) => names.includes(name));
  if (!found) {
    throw new Error(`No matching collection found. Looked for: ${candidates.join(", ")}`);
  }
  return db.collection(found);
}

function normalizeStatus(raw: unknown): PublicHomeStatus {
  if (!raw || typeof raw !== "string") {
    return "available";
  }
  const key = raw.toLowerCase().trim();
  return STATUS_MAP[key] ?? "available";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(numeric) ? null : numeric;
  }
  return null;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function stringifyId(id: unknown): string {
  if (!id) return "";
  if (id instanceof ObjectId) return id.toHexString();
  return String(id);
}

function stringifyOptionalId(id: unknown): string | undefined {
  const value = stringifyId(id).trim();
  return value || undefined;
}

function toIsoDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value as Date | string);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export type BuilderProfileRecord = {
  id?: string;
  companyId?: string;
  builderName?: string;
  builderSlug?: string;
  description?: string;
  website?: string;
  websiteUrl?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  coverImageUrl?: string;
  serviceAreas?: string[];
  primaryColor?: string;
  secondaryColor?: string;
  pricingDisclaimer?: string;
  isVisible?: boolean;
  updatedAt?: string;
};

export type BuilderInCommunityRecord = {
  id?: string;
  companyId?: string;
  publicCommunityId?: string;
  keepupCommunityId?: string;
  builder?: {
    name?: string;
    slug?: string;
  };
  webData?: {
    primaryContact?: {
      name?: string;
      phone?: string;
      email?: string;
    };
    contactVisibility?: {
      showName?: boolean;
      showPhone?: boolean;
      showEmail?: boolean;
    };
    totalLots?: number | null;
    schools?: {
      district?: string;
      isd?: string;
      elementary?: string;
      middle?: string;
      high?: string;
    };
    amenities?: Array<{
      label?: string;
    }>;
    ammenities?: Array<{
      label?: string;
    }>;
    productTypes?: Array<{
      label?: string;
    }>;
    promo?: {
      headline?: string;
      description?: string;
      disclaimer?: string;
    } | string;
    hoa?: {
      amount?: number | null;
      cadence?: string;
    };
    taxRate?: number | null;
    mudTaxRate?: number | null;
    mudFeeAmount?: number | null;
    pidFeeAmount?: number | null;
    pidFeeFrequency?: string | null;
    taxDistrict?: string;
    hoaIncludes?: string[];
    hasPID?: boolean;
    hasMUD?: boolean;
    earnestMoney?: {
      amount?: number | null;
      visibility?: "hidden" | "public" | "gated";
    };
    realtorCommission?: {
      amount?: number | null;
      unit?: "percent" | "flat" | "unknown";
      visibility?: "hidden" | "public" | "gated";
    };
  };
  presentation?: {
    heroImageUrl?: string;
    description?: string;
    promotion?: string;
  };
  visibility?: {
    isPublished?: boolean;
  };
  modelsSummary?: Array<{
    address?: string;
    listingId?: string;
    floorPlanName?: string;
  }>;
  source?: "keepup" | "manual" | "scraper";
  lastPublishedAt?: string;
};

export type PlanCatalogImageRecord = {
  url?: string;
  width?: number | null;
  height?: number | null;
  alt?: string;
};

export type PlanCatalogAssetRecord = {
  fileUrl?: string;
  previewUrl?: string;
  originalFilename?: string;
  mimeType?: string;
};

export type PlanCatalogRecord = {
  id?: string;
  companyId?: string;
  keepupFloorPlanId?: string;
  source?: "keepup" | "manual" | "scraper";
  name?: string;
  slug?: string;
  beds?: number | null;
  baths?: number | null;
  halfBaths?: number | null;
  sqft?: number | null;
  stories?: number | null;
  garage?: string;
  garageSpaces?: number | null;
  description?: string;
  features?: string[];
  images?: PlanCatalogImageRecord[];
  asset?: PlanCatalogAssetRecord;
  previewUrl?: string;
  fileUrl?: string;
  primaryImageUrl?: string;
  productType?: string;
  lastPublishedAt?: string;
};

export type CommunityPlanOfferingRecord = {
  id?: string;
  companyId?: string;
  publicCommunityId?: string;
  planCatalogId?: string;
  keepupCommunityId?: string;
  keepupFloorPlanId?: string;
  isIncluded?: boolean;
  sortOrder?: number | null;
  basePriceFrom?: number | null;
  basePriceAsOf?: string;
  basePriceVisibility?: "hidden" | "public";
  descriptionOverride?: string;
  primaryImageOverrideUrl?: string;
  badges?: string[];
  source?: "keepup" | "manual" | "scraper";
  lastPublishedAt?: string;
};

async function resolveCollectionIfExists(
  db: Db,
  candidates: string[],
): Promise<Collection<Document> | null> {
  try {
    return await resolveCollection(db, candidates);
  } catch {
    return null;
  }
}

function toObjectIdVariants(id: string | null | undefined): Array<string | ObjectId> {
  if (!id) return [];
  const trimmed = String(id).trim();
  if (!trimmed) return [];
  const out: Array<string | ObjectId> = [trimmed];
  if (ObjectId.isValid(trimmed)) {
    out.push(new ObjectId(trimmed));
  }
  return out;
}

function uniqueQueryValues(values: Array<string | ObjectId>): Array<string | ObjectId> {
  const seen = new Set<string>();
  const out: Array<string | ObjectId> = [];
  values.forEach((value) => {
    const key = value instanceof ObjectId ? `oid:${value.toHexString()}` : `str:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

function normalizeBuilderProfile(doc: WithId<Document>): BuilderProfileRecord {
  const rawServiceAreas = (doc as { serviceAreas?: unknown }).serviceAreas;
  const website =
    (doc as { website?: string }).website ||
    (doc as { websiteUrl?: string }).websiteUrl ||
    (doc as { url?: string }).url ||
    ((doc as { branding?: { website?: string; websiteUrl?: string } }).branding?.websiteUrl ??
      (doc as { branding?: { website?: string; websiteUrl?: string } }).branding?.website) ||
    ((doc as { company?: { website?: string; websiteUrl?: string } }).company?.websiteUrl ??
      (doc as { company?: { website?: string; websiteUrl?: string } }).company?.website) ||
    ((doc as { profile?: { website?: string; websiteUrl?: string } }).profile?.websiteUrl ??
      (doc as { profile?: { website?: string; websiteUrl?: string } }).profile?.website);

  return {
    id: stringifyOptionalId(doc._id),
    companyId: stringifyOptionalId((doc as { companyId?: unknown }).companyId),
    builderName: (doc as { builderName?: string }).builderName,
    builderSlug: (doc as { builderSlug?: string }).builderSlug || (doc as { slug?: string }).slug,
    description: (doc as { description?: string }).description,
    website,
    websiteUrl: website,
    logoUrl: (doc as { logoUrl?: string }).logoUrl,
    heroImageUrl: resolveAssetUrl((doc as { heroImageUrl?: string }).heroImageUrl),
    coverImageUrl: resolveAssetUrl((doc as { coverImageUrl?: string }).coverImageUrl),
    serviceAreas: Array.isArray(rawServiceAreas)
      ? rawServiceAreas
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : undefined,
    primaryColor: (doc as { primaryColor?: string }).primaryColor,
    secondaryColor: (doc as { secondaryColor?: string }).secondaryColor,
    pricingDisclaimer: (doc as { pricingDisclaimer?: string }).pricingDisclaimer,
    isVisible:
      toBoolean((doc as { isVisible?: unknown }).isVisible) ??
      toBoolean((doc as { visible?: unknown }).visible) ??
      toBoolean((doc as { published?: unknown }).published) ??
      toBoolean((doc as { isPublished?: unknown }).isPublished),
    updatedAt:
      toIsoDate((doc as { updatedAt?: Date | string }).updatedAt) ||
      toIsoDate((doc as { createdAt?: Date | string }).createdAt) ||
      toIsoDate((doc as { lastPublishedAt?: Date | string }).lastPublishedAt),
  };
}

function normalizeBuilderInCommunity(doc: WithId<Document>): BuilderInCommunityRecord {
  return {
    id: stringifyOptionalId(doc._id),
    companyId: stringifyOptionalId((doc as { companyId?: unknown }).companyId),
    publicCommunityId: stringifyOptionalId((doc as { publicCommunityId?: unknown }).publicCommunityId),
    keepupCommunityId: (doc as { keepupCommunityId?: string }).keepupCommunityId,
    builder: (doc as BuilderInCommunityRecord).builder,
    webData: (doc as BuilderInCommunityRecord).webData,
    presentation: (doc as BuilderInCommunityRecord).presentation,
    visibility: (doc as BuilderInCommunityRecord).visibility,
    modelsSummary: (doc as BuilderInCommunityRecord).modelsSummary,
    source: (doc as BuilderInCommunityRecord).source,
    lastPublishedAt: (doc as { lastPublishedAt?: Date | string }).lastPublishedAt
      ? new Date((doc as { lastPublishedAt?: Date | string }).lastPublishedAt as Date | string).toISOString()
      : undefined,
  };
}

function normalizePlanCatalog(doc: WithId<Document>): PlanCatalogRecord {
  const images = Array.isArray(doc.images)
    ? (doc.images as Array<{ url?: unknown; width?: unknown; height?: unknown; alt?: unknown }>)
      .map((image) => ({
        url: typeof image.url === "string" ? image.url : undefined,
        width: toNumber(image.width),
        height: toNumber(image.height),
        alt: typeof image.alt === "string" ? image.alt : undefined,
      }))
      .filter((image) => Boolean(image.url))
    : undefined;
  const assetField =
    doc.asset && typeof doc.asset === "object" && !Array.isArray(doc.asset)
      ? (doc.asset as {
          fileUrl?: unknown;
          previewUrl?: unknown;
          originalFilename?: unknown;
          mimeType?: unknown;
        })
      : null;
  const asset = assetField
    ? {
        fileUrl:
          typeof assetField.fileUrl === "string"
            ? resolveAssetUrl(assetField.fileUrl)
            : undefined,
        previewUrl:
          typeof assetField.previewUrl === "string"
            ? resolveAssetUrl(assetField.previewUrl)
            : undefined,
        originalFilename:
          typeof assetField.originalFilename === "string"
            ? assetField.originalFilename
            : undefined,
        mimeType:
          typeof assetField.mimeType === "string"
            ? assetField.mimeType
            : undefined,
      }
    : undefined;

  return {
    id: stringifyOptionalId(doc._id),
    companyId: stringifyOptionalId((doc as { companyId?: unknown }).companyId),
    keepupFloorPlanId: (doc as { keepupFloorPlanId?: string }).keepupFloorPlanId,
    source: (doc as PlanCatalogRecord).source,
    name: (doc as { name?: string }).name,
    slug: (doc as { slug?: string }).slug,
    beds: toNumber((doc as { beds?: unknown }).beds),
    baths: toNumber((doc as { baths?: unknown }).baths),
    halfBaths: toNumber((doc as { halfBaths?: unknown }).halfBaths),
    sqft: toNumber((doc as { sqft?: unknown }).sqft),
    stories: toNumber((doc as { stories?: unknown }).stories),
    garage: (doc as { garage?: string }).garage,
    garageSpaces: toNumber((doc as { garageSpaces?: unknown }).garageSpaces),
    description: (doc as { description?: string }).description,
    features: Array.isArray(doc.features) ? (doc.features as string[]).filter(Boolean) : undefined,
    images,
    asset,
    previewUrl: resolveAssetUrl((doc as { previewUrl?: string }).previewUrl),
    fileUrl: resolveAssetUrl((doc as { fileUrl?: string }).fileUrl),
    primaryImageUrl: (doc as { primaryImageUrl?: string }).primaryImageUrl,
    productType: (doc as { productType?: string }).productType,
    lastPublishedAt: (doc as { lastPublishedAt?: Date | string }).lastPublishedAt
      ? new Date((doc as { lastPublishedAt?: Date | string }).lastPublishedAt as Date | string).toISOString()
      : undefined,
  };
}

function normalizeCommunityPlanOffering(doc: WithId<Document>): CommunityPlanOfferingRecord {
  return {
    id: stringifyOptionalId(doc._id),
    companyId: stringifyOptionalId((doc as { companyId?: unknown }).companyId),
    publicCommunityId: stringifyOptionalId((doc as { publicCommunityId?: unknown }).publicCommunityId),
    planCatalogId: stringifyOptionalId((doc as { planCatalogId?: unknown }).planCatalogId),
    keepupCommunityId: (doc as { keepupCommunityId?: string }).keepupCommunityId,
    keepupFloorPlanId: (doc as { keepupFloorPlanId?: string }).keepupFloorPlanId,
    isIncluded: (doc as { isIncluded?: boolean }).isIncluded,
    sortOrder: toNumber((doc as { sortOrder?: unknown }).sortOrder),
    basePriceFrom: toNumber((doc as { basePriceFrom?: unknown }).basePriceFrom),
    basePriceAsOf: (doc as { basePriceAsOf?: Date | string }).basePriceAsOf
      ? new Date((doc as { basePriceAsOf?: Date | string }).basePriceAsOf as Date | string).toISOString()
      : undefined,
    basePriceVisibility: (doc as CommunityPlanOfferingRecord).basePriceVisibility,
    descriptionOverride: (doc as { descriptionOverride?: string }).descriptionOverride,
    primaryImageOverrideUrl: (doc as { primaryImageOverrideUrl?: string }).primaryImageOverrideUrl,
    badges: Array.isArray(doc.badges) ? (doc.badges as string[]).filter(Boolean) : undefined,
    source: (doc as CommunityPlanOfferingRecord).source,
    lastPublishedAt: (doc as { lastPublishedAt?: Date | string }).lastPublishedAt
      ? new Date((doc as { lastPublishedAt?: Date | string }).lastPublishedAt as Date | string).toISOString()
      : undefined,
  };
}

export function communityMatchClauses(id: string | null | undefined): Document[] {
  if (!id) return [];
  const candidates: Array<string | ObjectId> = [id];
  if (typeof id === "string" && ObjectId.isValid(id)) {
    candidates.push(new ObjectId(id));
  }
  return candidates.flatMap((val) => [
    { publicCommunityId: val },
    { keepupCommunityId: val },
    { communityId: val },
    { community_id: val },
    { buildrootzCommunityId: val },
    { communitySlug: val },
    { slug: val },
  ]);
}

function normalizeHome(doc: WithId<Document>): PublicHome {
  const addressField = doc.address;
  const addressObj =
    addressField && typeof addressField === "object"
      ? (addressField as { street?: string; city?: string; state?: string; zip?: string })
      : {};

  const builderField = doc.builder;
  const keepupBuilderId =
    (doc as { keepupBuilderId?: string }).keepupBuilderId ||
    (doc as { builderId?: string }).builderId ||
    (doc as { builder_id?: string }).builder_id ||
    (typeof builderField === "object" && builderField && (builderField as { id?: string }).id) ||
    (doc as { builder?: { id?: string } }).builder?.id ||
    undefined;
  const communityField = doc.community;
  const fees = (doc.fees as {
    hoaFee?: number | null;
    hoaFrequency?: string | null;
    tax?: number | null;
    mudFee?: number | null;
    pidFee?: number | null;
    pidFeeFrequency?: string | null;
    feeTypes?: string[];
  }) || {};
  const specs = (doc.specs as { beds?: unknown; baths?: unknown; sqft?: unknown; garage?: unknown }) || {};
  const plan = (doc.plan as { name?: string; planNumber?: string }) || {};
  const amenitiesField = doc.amenities;
  const floorPlanMedia = Array.isArray(doc.floorPlanMedia)
    ? (doc.floorPlanMedia as Array<{ url?: string; previewUrl?: string }>)
    : [];
  const salesContact =
    (doc.salesContact as { name?: string; phone?: string; email?: string }) ||
    (doc.contact as { name?: string; phone?: string; email?: string }) ||
    {};
  const modelAddress =
    (doc.modelAddress as { street?: string; city?: string; state?: string; zip?: string }) || {};
  const schools =
    (doc.schools as {
      isd?: string;
      elementary?: string;
      middle?: string;
      high?: string;
    }) || {};
  const coordinates =
    (doc.coordinates as { lat?: unknown; lng?: unknown }) ||
    (doc.location as { lat?: unknown; lng?: unknown }) ||
    {};

  const floorPlanPreviewUrls = floorPlanMedia
    .map((item) => resolveAssetUrl(item?.previewUrl))
    .filter((url): url is string => Boolean(url));

  const floorPlanMediaUrls = floorPlanMedia
    .map((item) => resolveAssetUrl(item?.url))
    .filter((url): url is string => Boolean(url));

  const addressLine =
    (typeof addressField === "string" ? addressField : undefined) ||
    addressObj.street ||
    (doc.addressLine1 as string) ||
    (doc.address1 as string) ||
    (doc.location?.address as string) ||
    (doc.location?.street as string) ||
    (doc.location?.line1 as string);

  const city =
    (doc.city as string) ||
    addressObj.city ||
    (doc.addressCity as string) ||
    (doc.location?.city as string);

  const state =
    (doc.state as string) ||
    addressObj.state ||
    (doc.addressState as string) ||
    (doc.location?.state as string);

  const postalCode =
    (doc.postalCode as string) ||
    addressObj.zip ||
    (doc.zip as string) ||
    (doc.addressZip as string) ||
    (doc.location?.postalCode as string);

  const builder =
    (typeof builderField === "string" ? builderField : null) ||
    (builderField && typeof builderField === "object" ? (builderField as { name?: string }).name : null) ||
    (doc.builderName as string) ||
    (doc.orgName as string);
  const builderSlug =
    (builderField && typeof builderField === "object" ? (builderField as { slug?: string }).slug : null) ||
    (doc.builderSlug as string) ||
    (doc.builder_slug as string) ||
    undefined;

  const communityName =
    (typeof communityField === "string" ? communityField : null) ||
    (communityField && typeof communityField === "object" ? (communityField as { name?: string }).name : null) ||
    (doc.communityName as string) ||
    (doc.communityTitle as string) ||
    (doc.community?.name as string);

  const keepupCommunityId =
    (doc as { keepupCommunityId?: string }).keepupCommunityId ||
    (doc as { communityId?: string }).communityId ||
    (doc as { community_id?: string }).community_id ||
    undefined;

  const publicCommunityId =
    (doc as { publicCommunityId?: string }).publicCommunityId ||
    (doc as { buildrootzCommunityId?: string }).buildrootzCommunityId ||
    keepupCommunityId ||
    undefined;

  const images: string[] = [];
  const rawImages =
    (Array.isArray(doc.images) ? doc.images : []) ??
    (Array.isArray(doc.photos) ? doc.photos : []);
  for (const img of rawImages) {
    const resolved = resolveAssetUrl(img as string);
    if (resolved) images.push(resolved);
  }
  const heroImages: string[] = [];
  if (Array.isArray(doc.heroImages)) {
    for (const img of doc.heroImages) {
      const resolved = resolveAssetUrl(img as string);
      if (resolved) heroImages.push(resolved);
    }
  }
  const singleHero = resolveAssetUrl(doc.heroImage as string);
  if (singleHero) heroImages.unshift(singleHero);
  const elevationImage = resolveAssetUrl(doc.elevationImage as string);
  const allImages = [
    elevationImage,
    ...heroImages,
    ...images,
  ].filter((url): url is string => Boolean(url));

  const floorPlanImage =
    floorPlanPreviewUrls[0] ||
    floorPlanMediaUrls.find((url) => /\.(png|jpe?g|webp|gif)$/i.test(url)) ||
    floorPlanMediaUrls
      .map((url) => url.replace(/\.pdf($|\?)/i, ".png$1"))
      .find((url) => url !== undefined);

  const amenities =
    Array.isArray(amenitiesField)
      ? (amenitiesField as Array<string | { category?: string; items?: string[] }>)
          .map((item) => {
            if (typeof item === "string") return item;
            const cat = item.category;
            const inner = Array.isArray(item.items) ? item.items.filter(Boolean) : [];
            return inner.length ? `${cat ? `${cat}: ` : ""}${inner.join(", ")}` : cat ?? null;
          })
          .filter((val): val is string => Boolean(val))
      : undefined;

  return {
    id:
      stringifyId(doc._id) ||
      stringifyId((doc as { homeId?: string }).homeId) ||
      stringifyId((doc as { id?: string }).id),
    companyId: stringifyOptionalId((doc as { companyId?: unknown }).companyId),
    keepupBuilderId: stringifyOptionalId(keepupBuilderId),
    isActive:
      toBoolean((doc as { isActive?: unknown }).isActive) ??
      toBoolean((doc as { active?: unknown }).active),
    title:
      (doc.title as string) ||
      (doc.name as string) ||
      (doc.planName as string) ||
      "Untitled home",
    price:
      toNumber(doc.price) ||
      toNumber((doc as { listPrice?: unknown }).listPrice) ||
      toNumber((doc as { basePrice?: unknown }).basePrice),
    address: addressLine,
    address1: addressLine,
    formattedAddress:
      (doc.formattedAddress as string) ||
      (doc.displayAddress as string) ||
      undefined,
    city,
    state,
    postalCode,
    beds:
      toNumber(doc.beds) ||
      toNumber((doc as { bedrooms?: unknown }).bedrooms) ||
      toNumber((doc as { specs?: { beds?: unknown } }).specs?.beds),
    baths:
      toNumber(doc.baths) ||
      toNumber((doc as { bathrooms?: unknown }).bathrooms) ||
      toNumber((doc as { specs?: { baths?: unknown } }).specs?.baths),
    sqft:
      toNumber(doc.sqft) ||
      toNumber((doc as { squareFeet?: unknown }).squareFeet) ||
      toNumber((doc as { specs?: { sqft?: unknown } }).specs?.sqft),
    lat: toNumber(coordinates.lat),
    lng: toNumber(coordinates.lng),
    status:
      normalizeStatus(doc.status) ||
      normalizeStatus((doc as { inventoryStatus?: string }).inventoryStatus),
    tag: (doc.tag as string) || (doc.badge as string),
    builder,
    builderSlug: stringifyOptionalId(builderSlug),
    communityName,
    communityId:
      stringifyId((doc as { communityId?: string }).communityId) ||
      stringifyId((doc as { community_id?: string }).community_id) ||
      stringifyId((doc as { community?: { id?: string } }).community?.id),
    publicCommunityId: stringifyId(publicCommunityId),
    keepupCommunityId: stringifyId(keepupCommunityId),
    keepupFloorPlanId:
      stringifyOptionalId((doc as { keepupFloorPlanId?: unknown }).keepupFloorPlanId) ||
      stringifyOptionalId((doc as { floorPlanId?: unknown }).floorPlanId) ||
      undefined,
    planCatalogId:
      stringifyOptionalId((doc as { planCatalogId?: unknown }).planCatalogId) ||
      undefined,
    communitySlug:
      (typeof communityField === "object" && communityField?.slug) ||
      (doc as { slug?: string }).slug ||
      undefined,
    published:
      (doc as { published?: boolean }).published ??
      (doc as { isPublished?: boolean }).isPublished ??
      (doc as { publishedToBuildrootz?: boolean }).publishedToBuildrootz ??
      undefined,
    heroImage: allImages[0],
    heroImages: allImages.length ? allImages : undefined,
    images: allImages.length ? allImages : undefined,
    description: (doc.description as string) || (doc.overview as string),
    highlights: (doc.highlights as string) || undefined,
    promo:
      normalizePromo((doc as { promo?: unknown }).promo) ||
      normalizePromo((doc as { promotion?: unknown }).promotion),
    promoMode: normalizePromoMode((doc as { promoMode?: unknown }).promoMode),
    planName: plan.name,
    planNumber: plan.planNumber,
    floorPlanUrl: floorPlanMediaUrls[0],
    floorPlanImage,
    incentives:
      Array.isArray(doc.incentives) && doc.incentives.length
        ? (doc.incentives as string[]).filter(Boolean)
        : undefined,
    amenities,
    salesContact: {
      name: salesContact.name,
      phone: salesContact.phone,
      email: salesContact.email,
    },
    modelAddress:
      modelAddress && Object.values(modelAddress).some(Boolean)
        ? {
            street: modelAddress.street,
            city: modelAddress.city,
            state: modelAddress.state,
            zip: modelAddress.zip,
          }
        : undefined,
    schools:
      schools && Object.values(schools).some(Boolean)
        ? {
            isd: schools.isd,
            elementary: schools.elementary,
            middle: schools.middle,
            high: schools.high,
          }
        : undefined,
    hoaFee: toNumber(fees.hoaFee),
    hoaFrequency: fees.hoaFrequency ?? null,
    taxRate: toNumber(fees.tax),
    pidFee: toNumber(fees.pidFee),
    pidFeeFrequency: fees.pidFeeFrequency ?? null,
    mudFee: toNumber(fees.mudFee),
    feeTypes: Array.isArray(fees.feeTypes) ? fees.feeTypes.filter(Boolean) : undefined,
    garage: toNumber(specs.garage),
    updatedAt:
      toIsoDate((doc as { updatedAt?: Date | string }).updatedAt) ||
      toIsoDate((doc as { createdAt?: Date | string }).createdAt) ||
      toIsoDate((doc as { lastPublishedAt?: Date | string }).lastPublishedAt),
  };
}

function normalizeCommunity(
  doc: WithId<Document>,
  bic?: BuilderInCommunityRecord | null,
): PublicCommunity {
  const modelAddress =
    (doc.modelAddress as { street?: string; city?: string; state?: string; zip?: string }) || {};
  const hasModelAddress = modelAddress && Object.values(modelAddress).some(Boolean);
  const rawCommunityImages = Array.isArray(doc.imageUrls)
    ? (doc.imageUrls as unknown[])
    : Array.isArray(doc.images)
      ? (doc.images as unknown[])
      : Array.isArray(doc.photos)
        ? (doc.photos as unknown[]).map((item) =>
            item && typeof item === "object" && "url" in (item as Record<string, unknown>)
              ? (item as { url?: string }).url
              : item,
          )
        : [];
  const imageUrls = rawCommunityImages
    .map((item) => (typeof item === "string" ? resolveAssetUrl(item) : undefined))
    .filter((item): item is string => Boolean(item));
  const keepupCommunityId =
    (doc as { keepupCommunityId?: string }).keepupCommunityId ||
    (doc as { communityId?: string }).communityId ||
    undefined;

  const legacyAmenities = (doc as {
    ammenities?: Array<string | { category?: string; items?: string[] }>;
  }).ammenities;
  const rawProductTypes = (doc as {
    productTypes?: Array<string | { label?: string }>;
  }).productTypes;
  const amenities = Array.isArray(doc.amenities)
    ? (doc.amenities as Array<string | { label?: string; category?: string; items?: string[] }>)
        .map((item) => {
          if (typeof item === "string") return item;
          if (typeof item.label === "string" && item.label.trim()) return item.label.trim();
          const cat = item.category;
          const inner = Array.isArray(item.items) ? item.items.filter(Boolean) : [];
          return inner.length ? `${cat ? `${cat}: ` : ""}${inner.join(", ")}` : cat ?? null;
        })
        .filter((val): val is string => Boolean(val))
    : Array.isArray(legacyAmenities)
      ? legacyAmenities
          .map((item) => {
            if (typeof item === "string") return item;
            if (typeof (item as { label?: string }).label === "string" && (item as { label?: string }).label?.trim()) {
              return (item as { label?: string }).label?.trim() ?? null;
            }
            const cat = item.category;
            const inner = Array.isArray(item.items) ? item.items.filter(Boolean) : [];
            return inner.length ? `${cat ? `${cat}: ` : ""}${inner.join(", ")}` : cat ?? null;
          })
          .filter((val): val is string => Boolean(val))
    : typeof doc.amenities === "string"
      ? doc.amenities.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
  const productTypes = Array.isArray(rawProductTypes)
    ? rawProductTypes
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (typeof item?.label === "string") return item.label.trim();
          return "";
        })
        .filter(Boolean)
    : [];

  const builders = Array.isArray(doc.builders)
    ? (doc.builders as unknown[])
        .map((item) => (typeof item === "string" ? item.trim() : stringifyId(item).trim()))
        .filter(Boolean)
    : (doc.builder as { name?: string })?.name
      ? [(doc.builder as { name?: string }).name as string]
      : [];

  const fees = (doc.fees as {
    hoaMonthly?: number | null;
    hoaFee?: number | null;
    hoaFrequency?: string | null;
    tax?: number | null;
    taxRate?: number | null;
    mudTaxRate?: number | null;
    mudFee?: number | null;
    mudFeeAmount?: number | null;
    pidFee?: number | null;
    pidFeeFrequency?: string | null;
    pid?: boolean | null;
    hasPid?: boolean | null;
    mud?: boolean | null;
    hasMud?: boolean | null;
    taxDistrict?: string | null;
    hoaIncludes?: string[] | null;
  }) || {};
  const communityDetails = (doc.communityDetails as {
    hoaAmount?: unknown;
    pidMud?: { hasPid?: unknown; hasMud?: unknown } | null;
  }) || {};
  const docHoaIncludes = (doc as { hoaIncludes?: unknown[] }).hoaIncludes;
  const hoaFeeValue = toNumber(
    (doc as { hoaMonthly?: unknown }).hoaMonthly,
  ) ?? toNumber(fees.hoaMonthly) ?? toNumber(fees.hoaFee) ?? toNumber(communityDetails.hoaAmount);
  const hoaFrequency =
    typeof fees.hoaFrequency === "string" ? fees.hoaFrequency.trim() : null;
  const pidFeeFrequency =
    typeof (doc as { pidFeeFrequency?: unknown }).pidFeeFrequency === "string"
      ? ((doc as { pidFeeFrequency?: string }).pidFeeFrequency || "").trim() || null
      : typeof fees.pidFeeFrequency === "string"
        ? fees.pidFeeFrequency.trim() || null
        : null;
  const hoaFromFees =
    hoaFeeValue !== null
      ? `$${hoaFeeValue.toLocaleString()}${hoaFrequency ? ` ${hoaFrequency}` : ""}`
      : undefined;
  const baseCommunity: PublicCommunity = {
    id: stringifyId(doc._id),
    canonicalKey: (doc.canonicalKey as string) || undefined,
    slug: stringifyOptionalId(doc.slug),
    keepupCommunityId: stringifyId(keepupCommunityId),
    name:
      (doc.name as string) ||
      (doc.title as string) ||
      (doc.communityName as string),
    city:
      (doc.city as string) ||
      (doc.addressCity as string) ||
      (doc.location?.city as string),
    state:
      (doc.state as string) ||
      (doc.addressState as string) ||
      (doc.location?.state as string),
    overview:
      (doc.overview as string) ||
      (doc.description as string) ||
      (doc.summary as string) ||
      null,
    highlights: Array.isArray(doc.highlights)
      ? (doc.highlights as unknown[])
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [],
    heroImageUrl:
      resolveAssetUrl(doc.heroImageUrl as string) ||
      resolveAssetUrl(doc.mapImage as string) ||
      resolveAssetUrl(doc.heroImage as string) ||
      resolveAssetUrl(doc.image as string) ||
      imageUrls[0] ||
      null,
    imageUrls,
    hoaMonthly: hoaFeeValue,
    taxRate:
      toNumber((doc as { taxRate?: unknown }).taxRate) ??
      toNumber(fees.taxRate) ??
      toNumber(fees.tax),
    mudTaxRate:
      toNumber((doc as { mudTaxRate?: unknown }).mudTaxRate) ??
      toNumber(fees.mudTaxRate),
    mudFeeAmount:
      toNumber((doc as { mudFeeAmount?: unknown }).mudFeeAmount) ??
      toNumber(fees.mudFeeAmount) ??
      toNumber(fees.mudFee),
    pidFee:
      toNumber((doc as { pidFee?: unknown }).pidFee) ??
      toNumber(fees.pidFee),
    pidFeeFrequency,
    pid:
      toBoolean((doc as { pid?: unknown }).pid) ??
      toBoolean(fees.pid) ??
      toBoolean(fees.hasPid) ??
      toBoolean(communityDetails.pidMud?.hasPid),
    mud:
      toBoolean((doc as { mud?: unknown }).mud) ??
      toBoolean(fees.mud) ??
      toBoolean(fees.hasMud) ??
      toBoolean(communityDetails.pidMud?.hasMud),
    taxDistrict:
      ((doc as { taxDistrict?: string }).taxDistrict || (fees.taxDistrict as string) || null),
    hoaIncludes: Array.isArray(docHoaIncludes)
      ? docHoaIncludes
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : Array.isArray(fees.hoaIncludes)
        ? fees.hoaIncludes
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
        : [],
    description:
      (doc.description as string) ||
      (doc.overview as string) ||
      (doc.summary as string),
    promo:
      normalizePromo((doc as { promo?: unknown }).promo) ||
      normalizePromo((doc as { promotion?: unknown }).promotion),
    hoa:
      (doc.hoa as string) ||
      (doc.hoaDues as string) ||
      (doc.hoaFees as string) ||
      hoaFromFees,
    taxes:
      (doc.taxes as string) ||
      (doc.taxRate as string) ||
      (typeof fees.tax === "number" ? `${fees.tax}%` : undefined),
    dues: (doc.dues as string) || (doc.duesMonthly as string),
    amenities,
    productTypes,
    builders,
    published:
      toBoolean((doc as { published?: unknown }).published) ??
      toBoolean((doc as { isPublished?: unknown }).isPublished) ??
      toBoolean((doc as { publishedToBuildrootz?: unknown }).publishedToBuildrootz) ??
      toBoolean((doc as { visible?: unknown }).visible) ??
      toBoolean((doc as { isVisible?: unknown }).isVisible),
    mapImage:
      resolveAssetUrl(doc.heroImageUrl as string) ||
      resolveAssetUrl(doc.mapImage as string) ||
      resolveAssetUrl(doc.heroImage as string) ||
      resolveAssetUrl(doc.image as string) ||
      imageUrls[0],
    location:
      doc.location && typeof doc.location === "object"
        ? {
            lat: toNumber((doc.location as { lat?: unknown }).lat) ?? undefined,
            lng: toNumber((doc.location as { lng?: unknown }).lng) ?? undefined,
          }
        : undefined,
    updatedAt:
      toIsoDate((doc as { updatedAt?: Date | string }).updatedAt) ||
      toIsoDate((doc as { createdAt?: Date | string }).createdAt) ||
      toIsoDate((doc as { lastPublishedAt?: Date | string }).lastPublishedAt),
    modelAddress: hasModelAddress
      ? {
          street: modelAddress.street,
          city: modelAddress.city,
          state: modelAddress.state,
          zip: modelAddress.zip,
        }
      : undefined,
  };
  const normalized = withCommunityDetails(
    baseCommunity as unknown as Record<string, unknown>,
    doc as Record<string, unknown>,
  ) as PublicCommunity;
  return mergeBuilderInCommunityIntoPublicCommunity(normalized, bic) as PublicCommunity;
}

export async function fetchPublicHomes(limit = 50): Promise<PublicHome[]> {
  const db = await getDb();
  const collection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);
  const homes = await collection.find({}).sort({ updatedAt: -1 }).limit(limit).toArray();

  return homes.map((doc) => normalizeHome(doc));
}

async function findModelHomeForCommunity(
  db: Db,
  communityId?: string | null,
): Promise<PublicHome | null> {
  if (!communityId) return null;
  const collection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);
  const communityMatch = communityMatchClauses(communityId);
  const doc = await collection
    .findOne({
      $and: [
        {
          $or: [
            { status: { $regex: /model/i } },
            { generalStatus: { $regex: /model/i } },
          ],
        },
        { $or: communityMatch },
      ],
    })
    .catch(() => null);
  return doc ? normalizeHome(doc) : null;
}

export async function fetchModelHomesByCommunity(communityId: string): Promise<PublicHome[]> {
  if (!communityId) return [];
  const db = await getDb();
  const collection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);
  const communityMatch = communityMatchClauses(communityId);
  const docs = await collection
    .find({
      $and: [
        {
          $or: [
            { status: { $regex: /model/i } },
            { generalStatus: { $regex: /model/i } },
          ],
        },
        { $or: communityMatch },
      ],
    })
    .toArray()
    .catch(() => []);
  return docs.map((doc) => normalizeHome(doc));
}

async function attachModelAddresses(
  db: Db,
  communities: PublicCommunity[],
): Promise<PublicCommunity[]> {
  const missing = communities.filter((c) => c.id && !c.modelAddress).map((c) => c.id);
  if (!missing.length) return communities;

  const collection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);
  const missingWithOid = missing.flatMap((id) =>
    ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id],
  );
  const communityMatch = [
    { publicCommunityId: { $in: missingWithOid } },
    { keepupCommunityId: { $in: missingWithOid } },
    { communityId: { $in: missingWithOid } },
    { community_id: { $in: missingWithOid } },
    { buildrootzCommunityId: { $in: missingWithOid } },
    { communitySlug: { $in: missingWithOid } },
    { slug: { $in: missingWithOid } },
  ];
  const docs = await collection
    .find({
      $and: [
        {
          $or: [
            { status: { $regex: /model/i } },
            { generalStatus: { $regex: /model/i } },
          ],
        },
        { $or: communityMatch },
      ],
    })
    .toArray()
    .catch(() => []);

  const modelMap = new Map<string, PublicHome>();
  docs.forEach((doc) => {
    const normalized = normalizeHome(doc);
    const key = normalized.publicCommunityId || normalized.keepupCommunityId || normalized.communityId;
    if (key && !modelMap.has(key)) {
      modelMap.set(key, normalized);
    }
  });

  return communities.map((community) => {
    if (community.modelAddress || !community.id) return community;
    const modelHome =
      modelMap.get(community.id) ||
      (community.keepupCommunityId ? modelMap.get(community.keepupCommunityId) : undefined);
    if (!modelHome) return community;
    return {
      ...community,
      modelAddress: {
        street: modelHome.address,
        city: modelHome.city,
        state: modelHome.state,
        zip: modelHome.postalCode,
      },
    };
  });
}

export async function fetchPublicHomeById(id: string): Promise<PublicHome | null> {
  if (!id) return null;
  const db = await getDb();
  const collection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);
  const query: Document[] = [];
  if (ObjectId.isValid(id)) {
    query.push({ _id: new ObjectId(id) });
  }
  query.push(
    { id },
    { homeId: id },
    { listingId: id },
    { sourceHomeId: id },
    { sourceListingId: id },
    { buildrootzCommunityId: id },
    { slug: id },
  );

  const home = await collection.findOne({ $or: query }).catch(() => null);

  return home ? normalizeHome(home) : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function fetchPublicHomesByBuilder(
  builderRef: string,
  limit = 50,
): Promise<PublicHome[]> {
  if (!builderRef) return [];
  const db = await getDb();
  const collection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);
  const or: Document[] = [
    { keepupBuilderId: builderRef },
    { builderId: builderRef },
    { builder_id: builderRef },
    { "builder.id": builderRef },
    { builderSlug: builderRef },
    { "builder.slug": builderRef },
  ];
  const nameGuess = builderRef.replace(/[-_]+/g, " ").trim();
  if (nameGuess) {
    const regex = new RegExp(`^${escapeRegExp(nameGuess)}$`, "i");
    or.push(
      { builder: regex },
      { builderName: regex },
      { "builder.name": regex },
      { orgName: regex },
    );
  }
  if (ObjectId.isValid(builderRef)) {
    const oid = new ObjectId(builderRef);
    or.push(
      { keepupBuilderId: oid },
      { builderId: oid },
      { builder_id: oid },
      { "builder.id": oid },
    );
  }
  const docs = await collection
    .find({ $or: or })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray()
    .catch(() => []);
  return docs.map((doc) => normalizeHome(doc));
}

export async function fetchPublicHomesByCommunity(
  communityId: string,
  limit = 250,
): Promise<PublicHome[]> {
  if (!communityId) return [];
  const db = await getDb();
  const collection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);
  const communityMatch = communityMatchClauses(communityId);
  if (!communityMatch.length) return [];

  const docs = await collection
    .find({ $or: communityMatch })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray()
    .catch(() => []);

  return docs.map((doc) => normalizeHome(doc));
}

export async function fetchPublicHomesByFloorPlanRef(
  floorPlanRef: string,
  opts?: { planCatalogId?: string | null; keepupFloorPlanId?: string | null },
  limit = 250,
): Promise<PublicHome[]> {
  const ref = floorPlanRef.trim();
  const planCatalogId = (opts?.planCatalogId || "").trim();
  const keepupFloorPlanId = (opts?.keepupFloorPlanId || "").trim();
  if (!ref && !planCatalogId && !keepupFloorPlanId) return [];

  const db = await getDb();
  const collection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);

  const queryOr: Document[] = [];
  const keepupCandidates = Array.from(
    new Set([ref, keepupFloorPlanId].map((value) => value.trim()).filter(Boolean)),
  );
  if (keepupCandidates.length) {
    queryOr.push({ keepupFloorPlanId: { $in: keepupCandidates } });
    queryOr.push({ floorPlanId: { $in: keepupCandidates } });
  }

  const planCatalogCandidates = uniqueQueryValues(
    [ref, planCatalogId]
      .map((value) => value.trim())
      .filter(Boolean)
      .flatMap((value) => toObjectIdVariants(value)),
  );
  if (planCatalogCandidates.length) {
    queryOr.push({ planCatalogId: { $in: planCatalogCandidates } });
  }

  if (!queryOr.length) return [];
  const query = queryOr.length === 1 ? queryOr[0] : { $or: queryOr };

  const docs = await collection
    .find(query)
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray()
    .catch(() => []);

  return docs.map((doc) => normalizeHome(doc));
}

export async function fetchBuilderProfileByRef(
  builderRef: string,
): Promise<BuilderProfileRecord | null> {
  if (!builderRef) return null;
  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, BUILDER_PROFILE_COLLECTION_CANDIDATES);
  if (!collection) return null;

  const ref = builderRef.trim();
  const or: Document[] = [
    { builderSlug: ref },
    { slug: ref },
    { keepupCompanyId: ref },
    { companyId: ref },
  ];
  if (ObjectId.isValid(ref)) {
    const oid = new ObjectId(ref);
    or.push({ _id: oid }, { companyId: oid }, { keepupCompanyId: oid });
  }
  const nameGuess = ref.replace(/[-_]+/g, " ").trim();
  if (nameGuess) {
    const regex = new RegExp(`^${escapeRegExp(nameGuess)}$`, "i");
    or.push({ builderName: regex }, { name: regex });
  }

  const doc = await collection
    .findOne({ $or: or }, { sort: { updatedAt: -1, createdAt: -1, _id: -1 } })
    .catch(() => null);
  return doc ? normalizeBuilderProfile(doc) : null;
}

export async function fetchBuilderProfilesBySlugs(
  slugs: string[],
): Promise<BuilderProfileRecord[]> {
  const normalized = Array.from(
    new Set(
      (slugs || [])
        .map((slug) => (typeof slug === "string" ? slug.trim() : ""))
        .filter(Boolean),
    ),
  );
  if (!normalized.length) return [];

  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, BUILDER_PROFILE_COLLECTION_CANDIDATES);
  if (!collection) return [];

  const docs = await collection
    .find({
      $or: [{ builderSlug: { $in: normalized } }, { slug: { $in: normalized } }],
    })
    .toArray()
    .catch(() => []);
  return docs.map((doc) => normalizeBuilderProfile(doc));
}

export async function fetchBuilderProfilesByCompanyIds(
  companyIds: string[],
): Promise<BuilderProfileRecord[]> {
  const normalizedCompanyIds = Array.from(
    new Set(
      (companyIds || [])
        .map((companyId) => (typeof companyId === "string" ? companyId.trim() : ""))
        .filter(Boolean),
    ),
  );
  if (!normalizedCompanyIds.length) return [];

  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, BUILDER_PROFILE_COLLECTION_CANDIDATES);
  if (!collection) return [];

  const companyVariants = uniqueQueryValues(
    normalizedCompanyIds.flatMap((companyId) => toObjectIdVariants(companyId)),
  );
  if (!companyVariants.length) return [];

  const docs = await collection
    .find({
      companyId: { $in: companyVariants },
    })
    .toArray()
    .catch(() => []);
  return docs.map((doc) => normalizeBuilderProfile(doc));
}

export async function fetchBuilderProfiles(limit = 200): Promise<BuilderProfileRecord[]> {
  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, BUILDER_PROFILE_COLLECTION_CANDIDATES);
  if (!collection) return [];

  const docs = await collection
    .find({})
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray()
    .catch(() => []);

  return docs.map((doc) => normalizeBuilderProfile(doc));
}

async function resolveInternalAppBaseUrl(): Promise<string> {
  const configuredBase = (
    process.env.BUILDROOTZ_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).trim();
  if (configuredBase) {
    return configuredBase.replace(/\/$/, "");
  }

  const vercelUrl = (process.env.VERCEL_URL || "").trim();
  if (vercelUrl) {
    const host = vercelUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  try {
    const nextHeaders = await import("next/headers");
    const incoming = await nextHeaders.headers();
    const host =
      incoming.get("x-forwarded-host") ||
      incoming.get("host") ||
      "";
    if (host) {
      const proto = incoming.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // ignore: no request context
  }

  return "http://localhost:3000";
}

export async function fetchCommunityListingCounts(
  publicCommunityId: string,
  companyIds: string[] = [],
): Promise<Record<string, number>> {
  const normalizedCommunityId = (publicCommunityId || "").trim();
  if (!normalizedCommunityId) return {};

  const normalizedCompanyIds = Array.from(
    new Set(
      (companyIds || [])
        .map((companyId) => (typeof companyId === "string" ? companyId.trim() : ""))
        .filter(Boolean),
    ),
  );

  try {
    const baseUrl = await resolveInternalAppBaseUrl();
    const params = new URLSearchParams();
    if (normalizedCompanyIds.length) {
      params.set("companyIds", normalizedCompanyIds.join(","));
    }
    const query = params.toString();
    const response = await fetch(
      `${baseUrl}/api/public/communities/${encodeURIComponent(normalizedCommunityId)}/listing-counts${query ? `?${query}` : ""}`,
      { cache: "no-store" },
    );
    if (!response.ok) return {};
    const payload = await response.json();
    if (!payload?.ok || !payload?.counts || typeof payload.counts !== "object") {
      return {};
    }
    const counts: Record<string, number> = {};
    Object.entries(payload.counts as Record<string, unknown>).forEach(([companyId, count]) => {
      const normalizedCompanyId = companyId.trim();
      if (!normalizedCompanyId) return;
      const numericCount = Number(count);
      counts[normalizedCompanyId] = Number.isFinite(numericCount) ? numericCount : 0;
    });
    return counts;
  } catch {
    return {};
  }
}

export async function fetchBuilderInCommunitiesByCompanyId(
  companyId: string,
): Promise<BuilderInCommunityRecord[]> {
  if (!companyId) return [];
  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, BUILDER_IN_COMMUNITY_COLLECTION_CANDIDATES);
  if (!collection) return [];

  const companyVariants = toObjectIdVariants(companyId);
  if (!companyVariants.length) return [];

  const docs = await collection
    .find({
      companyId: { $in: companyVariants },
    })
    .toArray()
    .catch(() => []);

  return docs.map((doc) => normalizeBuilderInCommunity(doc));
}

export async function fetchBuilderInCommunitiesForCommunity(
  publicCommunityId: string,
  companyIds: string[] = [],
): Promise<BuilderInCommunityRecord[]> {
  if (!publicCommunityId) return [];
  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, BUILDER_IN_COMMUNITY_COLLECTION_CANDIDATES);
  if (!collection) return [];

  const communityVariants = toObjectIdVariants(publicCommunityId);
  if (!communityVariants.length) return [];

  const normalizedCompanyIds = Array.isArray(companyIds)
    ? companyIds.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)
    : [];
  const companyVariants = Array.from(
    new Set(normalizedCompanyIds.flatMap((id) => toObjectIdVariants(id))),
  );

  const query: Document = {
    publicCommunityId: { $in: communityVariants },
  };
  if (companyVariants.length) {
    query.companyId = { $in: companyVariants };
  }

  const docs = await collection
    .find(query)
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .toArray()
    .catch(() => []);
  return docs.map((doc) => normalizeBuilderInCommunity(doc));
}

export async function fetchPlanCatalogByCompanyId(
  companyId: string,
): Promise<PlanCatalogRecord[]> {
  if (!companyId) return [];
  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, PLAN_CATALOG_COLLECTION_CANDIDATES);
  if (!collection) return [];

  const companyVariants = uniqueQueryValues(toObjectIdVariants(companyId));
  if (!companyVariants.length) return [];

  const docs = await collection
    .find({ companyId: { $in: companyVariants } })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .toArray()
    .catch(() => []);

  return docs.map((doc) => normalizePlanCatalog(doc));
}

export async function fetchPlanCatalogByIds(
  planCatalogIds: string[],
): Promise<PlanCatalogRecord[]> {
  const normalizedIds = Array.from(
    new Set(
      (planCatalogIds || [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean),
    ),
  );
  if (!normalizedIds.length) return [];

  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, PLAN_CATALOG_COLLECTION_CANDIDATES);
  if (!collection) return [];

  const objectIds = normalizedIds
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (!objectIds.length) return [];

  const docs = await collection
    .find({ _id: { $in: objectIds } })
    .toArray()
    .catch(() => []);

  return docs.map((doc) => normalizePlanCatalog(doc));
}

export async function fetchPlanCatalogById(
  planCatalogId?: string | null,
): Promise<PlanCatalogRecord | null> {
  const id = typeof planCatalogId === "string" ? planCatalogId.trim() : "";
  if (!id) return null;
  const rows = await fetchPlanCatalogByIds([id]);
  return rows[0] || null;
}

export async function fetchPlanCatalogByRef(
  floorPlanRef?: string | null,
): Promise<PlanCatalogRecord | null> {
  const ref = typeof floorPlanRef === "string" ? floorPlanRef.trim() : "";
  if (!ref) return null;

  const byId = await fetchPlanCatalogById(ref);
  if (byId) return byId;

  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, PLAN_CATALOG_COLLECTION_CANDIDATES);
  if (!collection) return null;

  const queryOr: Document[] = [{ keepupFloorPlanId: ref }, { slug: ref }];
  const refAsObjectId = ObjectId.isValid(ref) ? new ObjectId(ref) : null;
  if (refAsObjectId) queryOr.push({ _id: refAsObjectId });
  const doc = await collection
    .findOne(
      queryOr.length === 1 ? queryOr[0] : { $or: queryOr },
      { sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
    )
    .catch(() => null);

  return doc ? normalizePlanCatalog(doc) : null;
}

export async function fetchOfferingsForCommunity(
  publicCommunityId: string,
  companyIds: string[],
): Promise<CommunityPlanOfferingRecord[]> {
  if (!publicCommunityId || !Array.isArray(companyIds) || !companyIds.length) return [];
  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, COMMUNITY_PLAN_OFFERING_COLLECTION_CANDIDATES);
  if (!collection) return [];

  const communityVariants = uniqueQueryValues(toObjectIdVariants(publicCommunityId));
  if (!communityVariants.length) return [];
  const companyVariants = uniqueQueryValues(
    companyIds.flatMap((companyId) => toObjectIdVariants(companyId)),
  );
  if (!companyVariants.length) return [];

  const docs = await collection
    .find({
      publicCommunityId: { $in: communityVariants },
      companyId: { $in: companyVariants },
    })
    .sort({ sortOrder: 1, updatedAt: -1, _id: -1 })
    .toArray()
    .catch(() => []);

  return docs.map((doc) => normalizeCommunityPlanOffering(doc));
}

export async function fetchOfferingsByCompanyId(
  companyId: string,
): Promise<CommunityPlanOfferingRecord[]> {
  if (!companyId) return [];
  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, COMMUNITY_PLAN_OFFERING_COLLECTION_CANDIDATES);
  if (!collection) return [];

  const companyVariants = uniqueQueryValues(toObjectIdVariants(companyId));
  if (!companyVariants.length) return [];

  const docs = await collection
    .find({ companyId: { $in: companyVariants } })
    .sort({ publicCommunityId: 1, sortOrder: 1, updatedAt: -1, _id: -1 })
    .toArray()
    .catch(() => []);

  return docs.map((doc) => normalizeCommunityPlanOffering(doc));
}

export async function fetchOfferingsByFloorPlanRef(
  floorPlanRef: string,
  opts?: { planCatalogId?: string | null; keepupFloorPlanId?: string | null },
): Promise<CommunityPlanOfferingRecord[]> {
  const ref = floorPlanRef.trim();
  const planCatalogId = (opts?.planCatalogId || "").trim();
  const keepupFloorPlanId = (opts?.keepupFloorPlanId || "").trim();
  if (!ref && !planCatalogId && !keepupFloorPlanId) return [];

  const db = await getDb();
  const collection = await resolveCollectionIfExists(db, COMMUNITY_PLAN_OFFERING_COLLECTION_CANDIDATES);
  if (!collection) return [];

  const queryOr: Document[] = [];
  const keepupCandidates = Array.from(
    new Set([ref, keepupFloorPlanId].map((value) => value.trim()).filter(Boolean)),
  );
  if (keepupCandidates.length) {
    queryOr.push({ keepupFloorPlanId: { $in: keepupCandidates } });
  }

  const planCatalogCandidates = uniqueQueryValues(
    [ref, planCatalogId]
      .map((value) => value.trim())
      .filter(Boolean)
      .flatMap((value) => toObjectIdVariants(value)),
  );
  if (planCatalogCandidates.length) {
    queryOr.push({ planCatalogId: { $in: planCatalogCandidates } });
  }

  if (ObjectId.isValid(ref)) {
    queryOr.push({ _id: new ObjectId(ref) });
  }

  if (!queryOr.length) return [];
  const query = queryOr.length === 1 ? queryOr[0] : { $or: queryOr };

  const docs = await collection
    .find(query)
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .toArray()
    .catch(() => []);

  return docs.map((doc) => normalizeCommunityPlanOffering(doc));
}

export async function fetchPublicCommunities(limit = 20): Promise<PublicCommunity[]> {
  const db = await getDb();
  const collection = await resolveCollection(db, COMMUNITY_COLLECTION_CANDIDATES);
  const communities = await collection.find({}).sort({ updatedAt: -1 }).limit(limit).toArray();

  const normalized = communities.map((doc) => normalizeCommunity(doc));
  return attachModelAddresses(db, normalized);
}

export async function fetchPublicCommunitiesByBuilder(
  builderRef: string,
  limit = 20,
): Promise<PublicCommunity[]> {
  if (!builderRef) return [];
  const db = await getDb();
  const collection = await resolveCollection(db, COMMUNITY_COLLECTION_CANDIDATES);
  const or: Document[] = [
    { keepupBuilderId: builderRef },
    { builderId: builderRef },
    { builder_id: builderRef },
    { "builder.id": builderRef },
    { builderSlug: builderRef },
    { "builder.slug": builderRef },
    { builders: builderRef },
  ];
  const nameGuess = builderRef.replace(/[-_]+/g, " ").trim();
  if (nameGuess) {
    const regex = new RegExp(`^${escapeRegExp(nameGuess)}$`, "i");
    or.push(
      { builder: regex },
      { builderName: regex },
      { "builder.name": regex },
      { builders: regex },
      { orgName: regex },
    );
  }
  if (ObjectId.isValid(builderRef)) {
    const oid = new ObjectId(builderRef);
    or.push(
      { keepupBuilderId: oid },
      { builderId: oid },
      { builder_id: oid },
      { "builder.id": oid },
    );
  }
  const docs = await collection
    .find({ $or: or })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray()
    .catch(() => []);
  const normalized = docs.map((doc) => normalizeCommunity(doc));
  return attachModelAddresses(db, normalized);
}

async function fetchBuilderInCommunityForCommunityAndCompany(
  db: Db,
  publicCommunityId: string,
  companyId: string,
): Promise<BuilderInCommunityRecord | null> {
  const normalizedCommunityId = publicCommunityId.trim();
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCommunityId || !normalizedCompanyId) return null;

  const collection = await resolveCollectionIfExists(db, BUILDER_IN_COMMUNITY_COLLECTION_CANDIDATES);
  if (!collection) return null;

  const communityVariants = uniqueQueryValues(toObjectIdVariants(normalizedCommunityId));
  const companyVariants = uniqueQueryValues(toObjectIdVariants(normalizedCompanyId));
  if (!communityVariants.length || !companyVariants.length) return null;

  const doc = await collection
    .findOne(
      {
        publicCommunityId: { $in: communityVariants },
        companyId: { $in: companyVariants },
        $or: [
          { "visibility.isPublished": true },
          { "visibility.isPublished": { $exists: false } },
        ],
      },
      { sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
    )
    .catch(() => null);

  return doc ? normalizeBuilderInCommunity(doc) : null;
}

export async function fetchPublicCommunityById(
  id?: string,
  opts?: { companyId?: string | null },
): Promise<PublicCommunity | null> {
  if (!id) return null;
  const db = await getDb();
  const collection = await resolveCollection(db, COMMUNITY_COLLECTION_CANDIDATES);
  const query: Document[] = [];
  if (ObjectId.isValid(id)) {
    query.push({ _id: new ObjectId(id) });
  }
  query.push({ id }, { communityId: id }, { keepupCommunityId: id }, { slug: id });

  const community = await collection.findOne({ $or: query }).catch(() => null);

  if (!community) return null;
  const bic = opts?.companyId
    ? await fetchBuilderInCommunityForCommunityAndCompany(
        db,
        stringifyId(community._id),
        opts.companyId,
      )
    : null;
  const normalized = normalizeCommunity(community, bic);
  if (normalized.modelAddress) return normalized;

  const modelHome = await findModelHomeForCommunity(db, normalized.id);
  if (!modelHome) return normalized;

  return {
    ...normalized,
    modelAddress: {
      street: modelHome.address,
      city: modelHome.city,
      state: modelHome.state,
      zip: modelHome.postalCode,
    },
  };
}
