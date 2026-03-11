import { NextResponse } from "next/server";
import { ObjectId, type Collection, type Db, type Document, type WithId } from "mongodb";
import { getDb } from "../../../../lib/mongodb";
import { fetchPublicHomes } from "../../../../lib/publicData";
import {
  buildListingsMongoQuery,
  buildListingsSort,
  matchesLegacyListing,
  paginateListings,
  resolvePrice,
  sortLegacyListings,
} from "../../../../../shared/listingsQuery";
import { mapPublicCommunityIdentitySummary } from "../../../../../shared/publicCommunityIdentity";

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

function normalizeString(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePublicMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\/uploads\//i.test(trimmed)) return trimmed;
  if (/^uploads\//i.test(trimmed)) return `/${trimmed.replace(/^\/+/, "")}`;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (/^\/uploads\//i.test(parsed.pathname)) {
        return `${parsed.pathname}${parsed.search || ""}`;
      }
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNumberParam(value: string | null, min = 0): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min) return null;
  return parsed;
}

function parseIntegerParam(value: string | null, fallback: number, min = 1, max = 100): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return Math.min(max, Math.max(min, rounded));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toCoordinatePair(latValue: unknown, lngValue: unknown): { lat: number; lng: number } | null {
  const lat = toFiniteNumber(latValue);
  const lng = toFiniteNumber(lngValue);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function toGeoJsonCoordinatePair(value: unknown): { lat: number; lng: number } | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = toFiniteNumber(value[0]);
  const lat = toFiniteNumber(value[1]);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function isValidCoordinatePair(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  // Treat 0/0 as invalid placeholder coordinates.
  if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) return false;
  return true;
}

type CoordinateResolution = {
  lat: number | null;
  lng: number | null;
  source: string | null;
};

function resolveHomeCoordinates(doc: WithId<Document>): CoordinateResolution {
  const geo = (doc.geo as Record<string, unknown> | undefined) || {};
  const coordinates = (doc.coordinates as Record<string, unknown> | undefined) || {};
  const location = (doc.location as Record<string, unknown> | undefined) || {};

  const candidates: Array<{ source: string; pair: { lat: number; lng: number } | null }> = [
    {
      source: "lat_lng",
      pair: toCoordinatePair(
        (doc as { lat?: unknown }).lat,
        (doc as { lng?: unknown }).lng,
      ),
    },
    {
      source: "geo_lat_lng",
      pair: toCoordinatePair(geo.lat, geo.lng),
    },
    {
      source: "coordinates_lat_lng",
      pair: toCoordinatePair(coordinates.lat, coordinates.lng),
    },
    {
      source: "location_lat_lng",
      pair: toCoordinatePair(location.lat, location.lng),
    },
    {
      source: "geo_coordinates_array",
      pair: toGeoJsonCoordinatePair(geo.coordinates),
    },
    {
      source: "coordinates_array",
      pair: toGeoJsonCoordinatePair(coordinates.coordinates),
    },
    {
      source: "location_coordinates_array",
      pair: toGeoJsonCoordinatePair(location.coordinates),
    },
  ];

  for (const candidate of candidates) {
    if (!candidate.pair) continue;
    if (!isValidCoordinatePair(candidate.pair.lat, candidate.pair.lng)) continue;
    return {
      lat: candidate.pair.lat,
      lng: candidate.pair.lng,
      source: candidate.source,
    };
  }

  return {
    lat: null,
    lng: null,
    source: null,
  };
}

function collectCoordinateWarnings(
  rows: Array<{ lat?: number | null; lng?: number | null }>,
): string[] {
  const warnings: string[] = [];
  let missing = 0;
  const buckets = new Map<string, number>();

  rows.forEach((row) => {
    const lat = typeof row.lat === "number" ? row.lat : null;
    const lng = typeof row.lng === "number" ? row.lng : null;
    if (lat === null || lng === null || !isValidCoordinatePair(lat, lng)) {
      missing += 1;
      return;
    }
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });

  if (missing > 0) {
    warnings.push(`MISSING_COORDINATES:${missing}`);
  }

  const duplicateRows = Array.from(buckets.values()).reduce(
    (sum, count) => (count > 1 ? sum + count : sum),
    0,
  );
  if (duplicateRows > 0) {
    warnings.push(`DUPLICATE_COORDINATES:${duplicateRows}`);
  }

  return warnings;
}

type MapBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

function parseBoundsParam(value: string | null): MapBounds | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  const parts = normalized.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

async function resolveCollection(
  db: Db,
  candidates: string[],
): Promise<Collection<Document> | null> {
  const names = await db.listCollections().toArray();
  const found = candidates.find((name) => names.some((collection) => collection.name === name));
  return found ? db.collection(found) : null;
}

function toObjectIdVariants(value: string): Array<string | ObjectId> {
  const normalized = normalizeString(value);
  if (!normalized) return [];
  const variants: Array<string | ObjectId> = [normalized];
  if (ObjectId.isValid(normalized)) {
    variants.push(new ObjectId(normalized));
  }
  return variants;
}

function uniqueVariants(values: Array<string | ObjectId>): Array<string | ObjectId> {
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

function parseBooleanFlag(value: string | null, defaultValue: boolean): boolean {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return defaultValue;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return defaultValue;
}

async function resolveCommunityVariants(
  db: Db,
  publicCommunityIdOrSlug: string,
  communitySlug: string,
): Promise<Array<string | ObjectId>> {
  const directId = normalizeString(publicCommunityIdOrSlug);
  const directSlug = normalizeString(communitySlug);

  if (!directId && !directSlug) return [];

  const directIdVariants = toObjectIdVariants(directId);
  if (directIdVariants.length > 1) {
    return uniqueVariants(directIdVariants);
  }

  const communityCollection = await resolveCollection(db, COMMUNITY_COLLECTION_CANDIDATES);
  if (!communityCollection) return directIdVariants;

  const slugToResolve = directSlug || directId;
  if (!slugToResolve) return directIdVariants;

  const communityDoc = await communityCollection
    .findOne({
      $or: [
        { slug: slugToResolve },
        { slug: { $regex: new RegExp(`^${escapeRegex(slugToResolve)}$`, "i") } },
        { keepupCommunityId: slugToResolve },
        { communityId: slugToResolve },
      ],
    })
    .catch(() => null);
  if (!communityDoc?._id) {
    return directIdVariants;
  }
  const resolved = String(communityDoc._id);
  return uniqueVariants(toObjectIdVariants(resolved));
}

async function resolveBuilderCompanyVariants(
  db: Db,
  companyId: string,
  builderId: string,
): Promise<Array<string | ObjectId>> {
  const companyRef = normalizeString(companyId);
  if (companyRef) {
    return uniqueVariants(toObjectIdVariants(companyRef));
  }

  const builderRef = normalizeString(builderId);
  if (!builderRef) return [];

  if (ObjectId.isValid(builderRef)) {
    return uniqueVariants(toObjectIdVariants(builderRef));
  }

  const builderCollection = await resolveCollection(db, BUILDER_PROFILE_COLLECTION_CANDIDATES);
  if (!builderCollection) return [];

  const doc = await builderCollection
    .findOne({
      $or: [
        { builderSlug: builderRef },
        { slug: builderRef },
        { builderName: { $regex: new RegExp(`^${escapeRegex(builderRef)}$`, "i") } },
      ],
    })
    .catch(() => null);

  const resolvedCompanyId =
    (doc?.companyId instanceof ObjectId ? doc.companyId.toHexString() : normalizeString(String(doc?.companyId || ""))) ||
    "";
  if (!resolvedCompanyId) return [];

  return uniqueVariants(toObjectIdVariants(resolvedCompanyId));
}

function mapDocToListingResult(doc: WithId<Document>) {
  const addressField = doc.address;
  const addressObject =
    addressField && typeof addressField === "object" && !Array.isArray(addressField)
      ? (addressField as { line1?: string; street?: string; city?: string; state?: string; zip?: string })
      : {};
  const photos = Array.isArray(doc.photos)
    ? (doc.photos as Array<{ url?: string }>)
        .map((photo) => normalizePublicMediaUrl(photo?.url))
        .filter((url): url is string => Boolean(url))
    : [];
  const heroImages = Array.isArray(doc.heroImages)
    ? (doc.heroImages as string[])
        .map((url) => normalizePublicMediaUrl(url))
        .filter((url): url is string => Boolean(url))
    : [];
  const images = Array.isArray(doc.images)
    ? (doc.images as string[])
        .map((url) => normalizePublicMediaUrl(url))
        .filter((url): url is string => Boolean(url))
    : [];
  const primaryPhotoFromDoc = normalizePublicMediaUrl(doc.primaryPhotoUrl);
  const heroImageFromDoc = normalizePublicMediaUrl(doc.heroImage);
  const primaryPhotoUrl =
    primaryPhotoFromDoc ||
    heroImageFromDoc ||
    photos[0] ||
    heroImages[0] ||
    images[0] ||
    null;
  const photosPreview = [primaryPhotoUrl, ...photos, ...heroImages, ...images]
    .filter((url): url is string => Boolean(url))
    .slice(0, 3);

  const resolvedCoordinates = resolveHomeCoordinates(doc);

  const price =
    typeof doc.listPrice === "number"
      ? doc.listPrice
      : typeof doc.price === "number"
        ? doc.price
        : (doc.price as { list?: number } | undefined)?.list ?? null;

  return {
    _id: String(doc._id),
    id: String(doc._id),
    publicCommunityId:
      doc.publicCommunityId instanceof ObjectId ? doc.publicCommunityId.toHexString() : doc.publicCommunityId,
    companyId: doc.companyId instanceof ObjectId ? doc.companyId.toHexString() : doc.companyId,
    address: {
      line1:
        addressObject.line1 ||
        addressObject.street ||
        (typeof doc.address1 === "string" ? doc.address1 : "") ||
        (typeof doc.addressLine1 === "string" ? doc.addressLine1 : "") ||
        (typeof doc.address === "string" ? doc.address : ""),
      city: addressObject.city || (typeof doc.city === "string" ? doc.city : ""),
      state: addressObject.state || (typeof doc.state === "string" ? doc.state : ""),
      zip: addressObject.zip || (typeof doc.postalCode === "string" ? doc.postalCode : ""),
    },
    address1:
      addressObject.line1 ||
      addressObject.street ||
      (typeof doc.address1 === "string" ? doc.address1 : "") ||
      (typeof doc.addressLine1 === "string" ? doc.addressLine1 : "") ||
      null,
    formattedAddress:
      (typeof doc.formattedAddress === "string" ? doc.formattedAddress : null) ||
      (typeof doc.displayAddress === "string" ? doc.displayAddress : null),
    city: addressObject.city || doc.city || null,
    state: addressObject.state || doc.state || null,
    postalCode: addressObject.zip || doc.postalCode || null,
    status: typeof doc.status === "string" ? doc.status : null,
    price,
    beds: typeof doc.beds === "number" ? doc.beds : null,
    baths: typeof doc.baths === "number" ? doc.baths : null,
    sqft: typeof doc.sqft === "number" ? doc.sqft : null,
    lat: resolvedCoordinates.lat,
    lng: resolvedCoordinates.lng,
    coordinateSource: resolvedCoordinates.source,
    primaryPhotoUrl,
    photosPreview,
    planCatalogId:
      doc.planCatalogId instanceof ObjectId ? doc.planCatalogId.toHexString() : doc.planCatalogId ?? null,
    keepupFloorPlanId: typeof doc.keepupFloorPlanId === "string" ? doc.keepupFloorPlanId : null,
    title: typeof doc.title === "string" ? doc.title : null,
    builder: typeof doc.builder === "string" ? doc.builder : null,
    builderSlug: typeof doc.builderSlug === "string" ? doc.builderSlug : null,
    keepupBuilderId:
      (typeof doc.keepupBuilderId === "string" && doc.keepupBuilderId) ||
      (typeof doc.builderId === "string" ? doc.builderId : null),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string | Date).toISOString() : null,
    lastPublishedAt: doc.lastPublishedAt
      ? new Date(doc.lastPublishedAt as string | Date).toISOString()
      : null,
  };
}

function mapLegacyHomeToListingResult(home: {
  id: string;
  publicCommunityId?: string;
  keepupCommunityId?: string;
  keepupBuilderId?: string;
  address?: string;
  address1?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  status?: string;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  lat?: number | null;
  lng?: number | null;
  heroImage?: string;
  heroImages?: string[];
  images?: string[];
  planName?: string;
  keepupFloorPlanId?: string;
  title?: string;
  builder?: string;
  builderSlug?: string;
  updatedAt?: string | null;
}) {
  const photosPreview = [home.heroImage, ...(home.heroImages || []), ...(home.images || [])]
    .map((url) => normalizePublicMediaUrl(url))
    .filter((url): url is string => Boolean(url))
    .slice(0, 3);

  return {
    _id: home.id,
    id: home.id,
    publicCommunityId: home.publicCommunityId || home.keepupCommunityId || null,
    companyId: home.keepupBuilderId || null,
    address: {
      line1: home.address || "",
      city: home.city || "",
      state: home.state || "",
      zip: home.postalCode || "",
    },
    address1: home.address || null,
    formattedAddress: home.formattedAddress || null,
    city: home.city || null,
    state: home.state || null,
    postalCode: home.postalCode || null,
    status: home.status || null,
    price: resolvePrice(home),
    beds: home.beds ?? null,
    baths: home.baths ?? null,
    sqft: home.sqft ?? null,
    lat: typeof home.lat === "number" ? home.lat : null,
    lng: typeof home.lng === "number" ? home.lng : null,
    coordinateSource: null,
    primaryPhotoUrl: photosPreview[0] || null,
    photosPreview,
    planCatalogId: null,
    keepupFloorPlanId: home.keepupFloorPlanId || null,
    title: home.title || null,
    builder: home.builder || null,
    builderSlug: home.builderSlug || null,
    keepupBuilderId: home.keepupBuilderId || null,
    updatedAt: home.updatedAt || null,
    lastPublishedAt: null,
  };
}

type ListingResult = ReturnType<typeof mapDocToListingResult>;

type ListingIdentityIncludes = {
  communitiesById: Record<
    string,
    {
      _id: string;
      slug?: string;
      name?: string;
      city?: string;
      state?: string;
      heroImageUrl?: string | null;
      imageUrlsPreview?: string[];
      photosPreview?: string[];
      highlights?: string[];
    }
  >;
  buildersByCompanyId: Record<
    string,
    {
      companyId: string;
      name?: string;
      slug?: string;
      logoUrl?: string;
    }
  >;
};

function mapCommunityDocToSummary(doc: WithId<Document>) {
  return mapPublicCommunityIdentitySummary(doc);
}

function mapBuilderDocToSummary(doc: WithId<Document>) {
  const companyIdRaw = doc.companyId;
  const companyId =
    companyIdRaw instanceof ObjectId
      ? companyIdRaw.toHexString()
      : normalizeString(String(companyIdRaw || ""));
  if (!companyId) return null;

  return {
    companyId,
    name:
      (typeof doc.builderName === "string" && doc.builderName) ||
      (typeof doc.name === "string" ? doc.name : undefined),
    slug:
      (typeof doc.builderSlug === "string" && doc.builderSlug) ||
      (typeof doc.slug === "string" ? doc.slug : undefined),
    logoUrl: typeof doc.logoUrl === "string" ? doc.logoUrl : undefined,
  };
}

async function loadIdentityIncludes(
  db: Db,
  results: ListingResult[],
): Promise<ListingIdentityIncludes> {
  const communityIds = Array.from(
    new Set(
      results
        .map((row) => normalizeString(row.publicCommunityId))
        .filter(Boolean),
    ),
  );
  const companyIds = Array.from(
    new Set(
      results
        .map((row) => normalizeString(row.companyId))
        .filter(Boolean),
    ),
  );

  const includes: ListingIdentityIncludes = {
    communitiesById: {},
    buildersByCompanyId: {},
  };

  const [communityCollection, builderCollection] = await Promise.all([
    communityIds.length ? resolveCollection(db, COMMUNITY_COLLECTION_CANDIDATES) : Promise.resolve(null),
    companyIds.length ? resolveCollection(db, BUILDER_PROFILE_COLLECTION_CANDIDATES) : Promise.resolve(null),
  ]);

  if (communityCollection && communityIds.length) {
    const docs = await communityCollection
      .find(
        {
          _id: {
            $in: communityIds
              .filter((id) => ObjectId.isValid(id))
              .map((id) => new ObjectId(id)),
          },
        },
        {
          projection: {
            name: 1,
            title: 1,
            communityName: 1,
            slug: 1,
            city: 1,
            state: 1,
            addressCity: 1,
            addressState: 1,
            heroImageUrl: 1,
            imageUrls: 1,
            highlights: 1,
            heroImage: 1,
            heroImages: { $slice: 3 },
            mapImage: 1,
            image: 1,
            images: { $slice: 3 },
            photos: { $slice: 3 },
          } satisfies Document,
        },
      )
      .toArray()
      .catch(() => []);

    docs.forEach((doc) => {
      const summary = mapCommunityDocToSummary(doc);
      includes.communitiesById[summary._id.toLowerCase()] = summary;
    });
  }

  if (builderCollection && companyIds.length) {
    const docs = await builderCollection
      .find(
        {
          companyId: {
            $in: uniqueVariants(companyIds.flatMap((id) => toObjectIdVariants(id))),
          },
        },
        {
          projection: {
            companyId: 1,
            builderName: 1,
            name: 1,
            builderSlug: 1,
            slug: 1,
            logoUrl: 1,
          } satisfies Document,
        },
      )
      .toArray()
      .catch(() => []);

    docs.forEach((doc) => {
      const summary = mapBuilderDocToSummary(doc);
      if (!summary) return;
      const key = summary.companyId.toLowerCase();
      if (includes.buildersByCompanyId[key]) return;
      includes.buildersByCompanyId[key] = summary;
    });
  }

  return includes;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  // Legacy contract before Phase 4 Part 2:
  // Listings page loaded `fetchPublicHomes(limit=50)` directly from Mongo with no query params,
  // no pagination, and simple updatedAt sorting. This route freezes an explicit query contract.
  const q = normalizeString(searchParams.get("q"));
  const publicCommunityId = normalizeString(searchParams.get("publicCommunityId"));
  const communitySlug = normalizeString(searchParams.get("communitySlug"));
  const companyId = normalizeString(searchParams.get("companyId"));
  const builderId = normalizeString(searchParams.get("builderId"));
  const keepupFloorPlanId = normalizeString(searchParams.get("keepupFloorPlanId"));
  const planCatalogId = normalizeString(searchParams.get("planCatalogId"));
  const status = normalizeString(searchParams.get("status"));
  const minPrice = parseNumberParam(searchParams.get("minPrice"), 0);
  const maxPrice = parseNumberParam(searchParams.get("maxPrice"), 0);
  const bedsMin = parseNumberParam(searchParams.get("bedsMin"), 0);
  const bathsMin = parseNumberParam(searchParams.get("bathsMin"), 0);
  const minSqft = parseNumberParam(searchParams.get("minSqft"), 0);
  const maxSqft = parseNumberParam(searchParams.get("maxSqft"), 0);
  const bounds = parseBoundsParam(searchParams.get("bounds"));
  const page = parseIntegerParam(searchParams.get("page"), 1, 1, 500);
  const pageSize = parseIntegerParam(searchParams.get("pageSize"), 24, 1, 120);
  const sort = normalizeString(searchParams.get("sort")) || "newest";
  const includeInactive = searchParams.get("includeInactive") === "1";
  const includeIdentity = parseBooleanFlag(searchParams.get("includeIdentity"), true);
  const fallbackEnabled = (
    process.env.LISTINGS_LEGACY_FALLBACK ??
    (process.env.NODE_ENV === "production" ? "0" : "1")
  ) === "1";

  const filters = {
    q,
    publicCommunityId,
    companyId,
    keepupFloorPlanId,
    planCatalogId,
    status,
    minPrice,
    maxPrice,
    bedsMin,
    bathsMin,
    minSqft,
    maxSqft,
    bounds,
    sort,
    includeInactive,
    page,
    pageSize,
  };

  try {
    const db = await getDb();
    const homeCollection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);
    if (!homeCollection) {
      return NextResponse.json(
        { ok: false, error: "PUBLIC_HOME_COLLECTION_NOT_FOUND" },
        { status: 500 },
      );
    }

    const [publicCommunityVariants, companyVariants] = await Promise.all([
      resolveCommunityVariants(db, publicCommunityId, communitySlug),
      resolveBuilderCompanyVariants(db, companyId, builderId),
    ]);
    const planCatalogVariants = uniqueVariants(toObjectIdVariants(planCatalogId));

    const query = buildListingsMongoQuery({
      includeInactive,
      publicCommunityVariants,
      companyVariants,
      keepupFloorPlanId,
      planCatalogVariants,
      status,
      minPrice,
      maxPrice,
      bedsMin,
      bathsMin,
      minSqft,
      maxSqft,
      q,
      bounds,
    });
    const sortSpec = buildListingsSort(sort);
    const skip = (page - 1) * pageSize;

    const projection: Document = {
      publicCommunityId: 1,
      companyId: 1,
      keepupCommunityId: 1,
      keepupFloorPlanId: 1,
      planCatalogId: 1,
      status: 1,
      price: 1,
      listPrice: 1,
      beds: 1,
      baths: 1,
      sqft: 1,
      lat: 1,
      lng: 1,
      geo: 1,
      coordinates: 1,
      location: 1,
      address: 1,
      address1: 1,
      addressLine1: 1,
      formattedAddress: 1,
      city: 1,
      state: 1,
      postalCode: 1,
      primaryPhotoUrl: 1,
      heroImage: 1,
      heroImages: { $slice: 3 },
      images: { $slice: 3 },
      photos: { $slice: 3 },
      title: 1,
      builder: 1,
      builderSlug: 1,
      keepupBuilderId: 1,
      builderId: 1,
      updatedAt: 1,
      lastPublishedAt: 1,
    };

    const [total, docs] = await Promise.all([
      homeCollection.countDocuments(query),
      homeCollection
        .find(query, { projection })
        .sort(sortSpec as Document)
        .skip(skip)
        .limit(pageSize)
        .toArray(),
    ]);

    if (total > 0 || !fallbackEnabled) {
      const results = docs.map((doc) => mapDocToListingResult(doc));
      const responsePayload: {
        ok: true;
        page: number;
        pageSize: number;
        total: number;
        results: ListingResult[];
        warnings: string[];
        includes?: ListingIdentityIncludes;
      } = {
        ok: true,
        page,
        pageSize,
        total,
        results,
        warnings: collectCoordinateWarnings(results),
      };
      if (includeIdentity) {
        responsePayload.includes = await loadIdentityIncludes(db, results);
      }
      return NextResponse.json(responsePayload);
    }

    const fallbackHomes = await fetchPublicHomes(500);
    const resolvedCommunityId = normalizeString(
      publicCommunityVariants.find((value) => typeof value === "string") as string | undefined,
    );
    const resolvedCompanyId = normalizeString(
      companyVariants.find((value) => typeof value === "string") as string | undefined,
    );
    const legacyFiltered = fallbackHomes.filter((home) =>
      matchesLegacyListing(home, {
        ...filters,
        publicCommunityId: resolvedCommunityId || filters.publicCommunityId,
        companyId: resolvedCompanyId || filters.companyId || builderId,
      }),
    );
    const legacySorted = sortLegacyListings(legacyFiltered, sort);
    const paged = paginateListings(legacySorted, page, pageSize);

    const results = paged.map((home) => mapLegacyHomeToListingResult(home));
    const responsePayload: {
      ok: true;
      page: number;
      pageSize: number;
      total: number;
      results: ListingResult[];
      warnings: string[];
      includes?: ListingIdentityIncludes;
    } = {
      ok: true,
      page,
      pageSize,
      total: legacyFiltered.length,
      results,
      warnings: ["LEGACY_FALLBACK_USED", ...collectCoordinateWarnings(results)],
    };
    if (includeIdentity) {
      responsePayload.includes = await loadIdentityIncludes(db, results);
    }
    return NextResponse.json(responsePayload);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "LISTINGS_QUERY_FAILED",
        message: err instanceof Error ? err.message : "Unknown listings query error",
      },
      { status: 500 },
    );
  }
}
