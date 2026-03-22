function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function buildListingsSort(sort) {
  const normalized = normalizeLower(sort);
  if (normalized === "price_asc") return { price: 1, _id: -1 };
  if (normalized === "price_desc") return { price: -1, _id: -1 };
  return { lastPublishedAt: -1, updatedAt: -1, _id: -1 };
}

function buildListingsMongoQuery(input = {}) {
  const {
    includeInactive = false,
    publicCommunityVariants = [],
    companyVariants = [],
    keepupFloorPlanId = "",
    planCatalogVariants = [],
    status = "",
    minPrice = null,
    maxPrice = null,
    bedsMin = null,
    bathsMin = null,
    minSqft = null,
    maxSqft = null,
    q = "",
    bounds = null,
  } = input;

  const query = {};
  if (!includeInactive) {
    // Treat legacy records with no `isActive` flag as active so local/test data still renders.
    query.$or = [{ isActive: true }, { isActive: { $exists: false } }];
  }
  if (Array.isArray(publicCommunityVariants) && publicCommunityVariants.length) {
    query.publicCommunityId = { $in: publicCommunityVariants };
  }
  if (Array.isArray(companyVariants) && companyVariants.length) {
    query.companyId = { $in: companyVariants };
  }
  if (keepupFloorPlanId) {
    query.keepupFloorPlanId = keepupFloorPlanId;
  }
  if (Array.isArray(planCatalogVariants) && planCatalogVariants.length) {
    query.planCatalogId = { $in: planCatalogVariants };
  }
  if (status) {
    query.status = { $regex: new RegExp(`^${escapeRegex(status)}$`, "i") };
  }

  const and = [];
  if (minPrice !== null || maxPrice !== null) {
    const priceRange = {};
    if (minPrice !== null) priceRange.$gte = minPrice;
    if (maxPrice !== null) priceRange.$lte = maxPrice;
    and.push({ $or: [{ price: priceRange }, { listPrice: priceRange }] });
  }
  if (bedsMin !== null) and.push({ beds: { $gte: bedsMin } });
  if (bathsMin !== null) and.push({ baths: { $gte: bathsMin } });
  if (minSqft !== null || maxSqft !== null) {
    const sqftRange = {};
    if (minSqft !== null) sqftRange.$gte = minSqft;
    if (maxSqft !== null) sqftRange.$lte = maxSqft;
    and.push({ sqft: sqftRange });
  }
  if (q) {
    const qRegex = new RegExp(escapeRegex(q), "i");
    and.push({
      $or: [
        { "address.line1": qRegex },
        { "address.street": qRegex },
        { addressLine1: qRegex },
        { city: qRegex },
        { state: qRegex },
        { postalCode: qRegex },
      ],
    });
  }
  if (
    bounds &&
    typeof bounds.minLng === "number" &&
    typeof bounds.minLat === "number" &&
    typeof bounds.maxLng === "number" &&
    typeof bounds.maxLat === "number"
  ) {
    const latRange = { $gte: bounds.minLat, $lte: bounds.maxLat };
    const lngRange = { $gte: bounds.minLng, $lte: bounds.maxLng };
    and.push({
      $or: [
        { lat: latRange, lng: lngRange },
        { "geo.lat": latRange, "geo.lng": lngRange },
        { "coordinates.lat": latRange, "coordinates.lng": lngRange },
        { "location.lat": latRange, "location.lng": lngRange },
      ],
    });
  }
  if (and.length) {
    query.$and = and;
  }
  return query;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resolvePrice(home) {
  const listPrice = toNumber(home?.listPrice);
  if (listPrice !== null) return listPrice;
  return toNumber(home?.price);
}

function matchesLegacyListing(home, filters = {}) {
  const status = normalizeLower(filters.status);
  if (status) {
    if (normalizeLower(home?.status) !== status) return false;
  }

  const communityId = normalizeString(filters.publicCommunityId);
  if (communityId) {
    const homeCommunityRefs = [
      normalizeString(home?.publicCommunityId),
      normalizeString(home?.keepupCommunityId),
      normalizeString(home?.communityId),
      normalizeString(home?.communitySlug),
    ];
    if (!homeCommunityRefs.includes(communityId)) return false;
  }

  const companyId = normalizeString(filters.companyId);
  if (companyId) {
    const homeBuilderRefs = [
      normalizeString(home?.keepupBuilderId),
      normalizeString(home?.builderId),
      normalizeString(home?.builderSlug),
    ];
    if (!homeBuilderRefs.includes(companyId)) return false;
  }

  const keepupFloorPlanId = normalizeString(filters.keepupFloorPlanId);
  if (keepupFloorPlanId) {
    const homePlanRefs = [
      normalizeString(home?.keepupFloorPlanId),
      normalizeString(home?.planNumber),
    ];
    if (!homePlanRefs.includes(keepupFloorPlanId)) return false;
  }

  const price = resolvePrice(home);
  if (filters.minPrice !== null && (price === null || price < filters.minPrice)) return false;
  if (filters.maxPrice !== null && (price === null || price > filters.maxPrice)) return false;

  const beds = toNumber(home?.beds);
  if (filters.bedsMin !== null && (beds === null || beds < filters.bedsMin)) return false;

  const baths = toNumber(home?.baths);
  if (filters.bathsMin !== null && (baths === null || baths < filters.bathsMin)) return false;

  const sqft = toNumber(home?.sqft);
  if (filters.minSqft !== null && (sqft === null || sqft < filters.minSqft)) return false;
  if (filters.maxSqft !== null && (sqft === null || sqft > filters.maxSqft)) return false;

  const q = normalizeLower(filters.q);
  if (q) {
    const haystack = [
      normalizeLower(home?.address),
      normalizeLower(home?.city),
      normalizeLower(home?.state),
      normalizeLower(home?.postalCode),
    ].join(" ");
    if (!haystack.includes(q)) return false;
  }

  const bounds = filters.bounds;
  if (
    bounds &&
    typeof bounds.minLng === "number" &&
    typeof bounds.minLat === "number" &&
    typeof bounds.maxLng === "number" &&
    typeof bounds.maxLat === "number"
  ) {
    const lat = toNumber(home?.lat);
    const lng = toNumber(home?.lng);
    if (lat === null || lng === null) return false;
    if (lat < bounds.minLat || lat > bounds.maxLat) return false;
    if (lng < bounds.minLng || lng > bounds.maxLng) return false;
  }

  return true;
}

function sortLegacyListings(listings = [], sort = "newest") {
  const normalized = normalizeLower(sort);
  const list = [...listings];
  if (normalized === "price_asc") {
    return list.sort((a, b) => {
      const left = resolvePrice(a);
      const right = resolvePrice(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    });
  }
  if (normalized === "price_desc") {
    return list.sort((a, b) => {
      const left = resolvePrice(a);
      const right = resolvePrice(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return right - left;
    });
  }
  return list;
}

function paginateListings(items = [], page = 1, pageSize = 24) {
  const safePage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
  const safePageSize = Math.max(1, Number.isFinite(pageSize) ? Math.floor(pageSize) : 24);
  const skip = (safePage - 1) * safePageSize;
  return items.slice(skip, skip + safePageSize);
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  buildListingsSort,
  buildListingsMongoQuery,
  matchesLegacyListing,
  sortLegacyListings,
  paginateListings,
  resolvePrice,
};
