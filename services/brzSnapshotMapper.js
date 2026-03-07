const { normalizeCommunityDetails } = require("../shared/communityDetails");
const {
  asObject,
  collectCommunityImageUrls,
  extractCommunityContent,
  normalizeHighlights,
} = require("../shared/communityContent");

function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function firstString(...values) {
  for (const value of values) {
    const found = cleanString(value);
    if (found) return found;
  }
  return null;
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(/[$,\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function toAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("%")) return trimmed;
  const numeric = Number(trimmed.replace(/[$,\s]/g, ""));
  if (Number.isFinite(numeric)) return numeric;
  return trimmed;
}

function slugify(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function mapBuilder(snapshotBuilder, builderSlug) {
  const builder = asObject(snapshotBuilder);
  const slug =
    firstString(builder.slug, builder.builderSlug, builder.handle, builderSlug) ||
    slugify(firstString(builder.name, builder.displayName, builder.companyName) || builderSlug || "builder");
  const name =
    firstString(builder.name, builder.displayName, builder.companyName) ||
    slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) ||
    "Builder";
  return {
    id: firstString(builder.id, builder.builderId, builder._id, slug) || slug,
    slug,
    name,
    logoUrl: firstString(builder.logoUrl, builder.logo, asObject(builder.branding).logoUrl),
    description: firstString(builder.description, builder.about, asObject(builder.branding).description) || "",
    websiteUrl: firstString(builder.websiteUrl, builder.website, asObject(builder.branding).websiteUrl),
  };
}

function mapAddress(input) {
  const item = asObject(input);
  return {
    street: firstString(item.street, item.address, item.line1),
    city: firstString(item.city),
    state: firstString(item.state),
    zip: firstString(item.zip, item.postalCode),
    label: firstString(item.label, item.name),
  };
}

function mapModel(input) {
  const item = asObject(input);
  const address = mapAddress(item.address || item.modelAddress || item);
  return {
    id: firstString(item.id, item.modelId, item._id),
    title: firstString(item.title, item.name, item.planName, address.label || "Model"),
    address,
    price: toAmount(item.price ?? item.listPrice ?? item.startingPrice),
    sqft: toNumber(item.sqft ?? asObject(item.specs).sqft),
    lotSize: firstString(item.lotSize, asObject(item.specs).lotSize),
  };
}

function mapPlan(input, communityContext = {}) {
  const item = asObject(input);
  const plan = asObject(item.plan);
  const pricing = asObject(item.pricing);
  const basePriceFrom =
    toNumber(item.basePriceFrom) ??
    toNumber(item.priceFrom) ??
    toNumber(pricing.basePriceFrom) ??
    toNumber(item.basePrice) ??
    toNumber(plan.basePrice);

  return {
    id: firstString(item.id, item.planId, plan.id, item._id, plan._id, `${communityContext.communityId || "community"}-${firstString(item.name, plan.name, item.title, "plan")}`),
    name: firstString(item.name, item.title, plan.name) || "Floor plan",
    communityId: communityContext.communityId || null,
    communityName: communityContext.communityName || null,
    communitySlug: communityContext.communitySlug || null,
    beds: toNumber(item.beds ?? asObject(item.specs).beds ?? plan.beds),
    baths: toNumber(item.baths ?? asObject(item.specs).baths ?? plan.baths),
    sqft: toNumber(item.sqft ?? asObject(item.specs).sqft ?? plan.sqft),
    garage: toNumber(item.garage ?? asObject(item.specs).garage ?? plan.garage),
    basePriceFrom,
    basePriceAsOf: firstString(item.basePriceAsOf, pricing.basePriceAsOf),
    detail: firstString(item.description, item.summary, plan.description),
  };
}

function mapAmenities(input) {
  return asArray(input)
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const obj = asObject(item);
      const category = cleanString(obj.category);
      const entries = asArray(obj.items).filter((v) => typeof v === "string" && v.trim());
      if (!entries.length) return category;
      return `${category ? `${category}: ` : ""}${entries.join(", ")}`;
    })
    .filter(Boolean);
}

function mapCommunity(input, builderName) {
  const community = asObject(input);
  const webData = asObject(community.webData);
  const nestedWebData = asObject(asObject(community.competitionProfile).webData);
  const presentation = asObject(community.presentation);
  const preferredContentSource =
    Object.keys(webData).length
      ? { ...presentation, ...webData }
      : Object.keys(nestedWebData).length
        ? { ...presentation, ...nestedWebData }
        : presentation;
  const content = extractCommunityContent(preferredContentSource, community);
  const communityImages = collectCommunityImageUrls(
    {
      heroImageUrl: content.heroImageUrl,
      imageUrls: content.imageUrls,
    },
  );
  const communityId =
    firstString(community.id, community.communityId, community._id, community.keepupCommunityId) ||
    slugify(firstString(community.name, community.title, "community"));
  const communitySlug =
    firstString(community.slug, community.communitySlug) ||
    slugify(firstString(community.name, community.title, communityId));
  const fees = asObject(community.fees);
  const hoaObj = asObject(community.hoa);
  const mappedModelAddresses = asArray(community.modelAddresses).map((entry) => mapAddress(entry));
  const communityModelAddress = mapAddress(community.modelAddress);
  if (!communityModelAddress.street && mappedModelAddresses.length) {
    Object.assign(communityModelAddress, mappedModelAddresses[0]);
  }
  const mappedModels = asArray(community.models).map((entry) => mapModel(entry));
  if (!mappedModels.length && mappedModelAddresses.length) {
    mappedModelAddresses.forEach((address, idx) => {
      mappedModels.push({
        id: `${communityId}-model-${idx + 1}`,
        title: address.label || `Model ${idx + 1}`,
        address,
        price: null,
        sqft: null,
        lotSize: null,
      });
    });
  }

  const floorPlanSource =
    asArray(community.floorPlans).length
      ? asArray(community.floorPlans)
      : asArray(community.planOfferings).length
        ? asArray(community.planOfferings)
        : asArray(community.plans);
  const floorPlans = floorPlanSource.map((entry) =>
    mapPlan(entry, {
      communityId,
      communityName: firstString(community.name, community.title) || "Community",
      communitySlug,
    }),
  );

  const hoaAmount =
    toAmount(hoaObj.amount) ??
    toAmount(community.hoaAmount) ??
    toAmount(fees.hoaFee) ??
    toAmount(community.hoa);
  const hoaCadence = firstString(hoaObj.cadence, community.hoaFrequency, fees.hoaFrequency);
  const hoaLabel =
    hoaAmount === null
      ? null
      : typeof hoaAmount === "number"
        ? `$${hoaAmount.toLocaleString()}${hoaCadence ? ` ${hoaCadence}` : ""}`
        : hoaAmount;

  const builderNames = asArray(community.builders)
    .map((value) => (typeof value === "string" ? value : firstString(value.name, value.builderName)))
    .filter(Boolean);
  const singleBuilderName = firstString(
    community.builderName,
    asObject(community.builder).name,
    typeof community.builder === "string" ? community.builder : null,
    builderName,
  );
  if (!builderNames.length && singleBuilderName) {
    builderNames.push(singleBuilderName);
  }

  return {
    id: communityId,
    slug: communitySlug,
    keepupCommunityId: firstString(community.keepupCommunityId, community.communityId),
    name: firstString(community.name, community.title) || "Community",
    city: firstString(community.city, asObject(community.location).city),
    state: firstString(community.state, asObject(community.location).state),
    overview: content.overview,
    highlights: normalizeHighlights(content.highlights, { maxItems: 6 }),
    heroImageUrl: content.heroImageUrl,
    imageUrls: communityImages.urls,
    description: content.overview,
    hoa: hoaLabel || undefined,
    taxes:
      firstString(community.taxes, community.taxRate, fees.tax ? `${fees.tax}%` : null) || undefined,
    dues: firstString(community.dues, community.duesMonthly) || undefined,
    amenities: mapAmenities(community.amenities),
    builders: builderNames,
    mapImage: communityImages.heroUrl,
    modelAddress: communityModelAddress.street ? communityModelAddress : undefined,
    modelAddresses: mappedModelAddresses.filter((item) => item.street || item.city || item.state || item.zip),
    models: mappedModels,
    floorPlans,
    communityDetails: normalizeCommunityDetails(community),
  };
}

function mapHome(input, fallbackBuilderName, communityLookup) {
  const item = asObject(input);
  const specs = asObject(item.specs);
  const addressObj = asObject(item.address);
  const communityRef = firstString(item.communityId, asObject(item.community).id, asObject(item.community).communityId);
  const matchedCommunity = communityRef ? communityLookup.get(communityRef) : null;
  return {
    id: firstString(item.id, item.listingId, item._id, item.homeId) || `${Date.now()}-${Math.random()}`,
    title: firstString(item.title, item.name, item.planName, "Home"),
    price: toNumber(item.price ?? item.listPrice ?? item.salesPrice),
    address: firstString(item.address, addressObj.street, addressObj.line1, asObject(item.modelAddress).street),
    city: firstString(item.city, addressObj.city, asObject(item.modelAddress).city),
    state: firstString(item.state, addressObj.state, asObject(item.modelAddress).state),
    postalCode: firstString(item.postalCode, item.zip, addressObj.zip, asObject(item.modelAddress).zip),
    beds: toNumber(item.beds ?? specs.beds),
    baths: toNumber(item.baths ?? specs.baths),
    sqft: toNumber(item.sqft ?? specs.sqft),
    status: "available",
    builder: firstString(item.builderName, asObject(item.builder).name, item.builder, fallbackBuilderName) || "Builder",
    communityName:
      firstString(item.communityName, asObject(item.community).name) ||
      matchedCommunity?.name ||
      undefined,
    heroImage: firstString(item.heroImage, asArray(item.images)[0]),
  };
}

function mapBuilderSnapshot(payloadInput, builderSlug) {
  const payload = asObject(payloadInput);
  const mappedBuilder = mapBuilder(payload.builder || payload.builderProfile || payload, builderSlug);
  const rawCommunities = asArray(payload.communities).length
    ? asArray(payload.communities)
    : asArray(asObject(payload.builder).communities).length
      ? asArray(asObject(payload.builder).communities)
      : asArray(asObject(payload.data).communities);
  const mappedCommunities = rawCommunities.map((entry) => mapCommunity(entry, mappedBuilder.name));
  const communityLookup = new Map();
  mappedCommunities.forEach((community) => {
    communityLookup.set(community.id, community);
    if (community.keepupCommunityId) communityLookup.set(community.keepupCommunityId, community);
    if (community.slug) communityLookup.set(community.slug, community);
  });

  const rawHomes = asArray(payload.homes).length
    ? asArray(payload.homes)
    : asArray(payload.listings).length
      ? asArray(payload.listings)
      : asArray(payload.inventory).length
        ? asArray(payload.inventory)
        : asArray(asObject(payload.data).homes).length
          ? asArray(asObject(payload.data).homes)
          : asArray(asObject(payload.data).listings);
  let mappedHomes = rawHomes.map((entry) => mapHome(entry, mappedBuilder.name, communityLookup));

  if (!mappedHomes.length) {
    mappedHomes = mappedCommunities.flatMap((community) =>
      asArray(community.models).map((model, idx) => ({
        id: model.id || `${community.id}-model-home-${idx + 1}`,
        title: model.title || `${community.name || "Community"} model`,
        price: toNumber(model.price),
        address: model.address?.street || undefined,
        city: model.address?.city || undefined,
        state: model.address?.state || undefined,
        postalCode: model.address?.zip || undefined,
        beds: null,
        baths: null,
        sqft: toNumber(model.sqft),
        status: "model",
        builder: mappedBuilder.name,
        communityName: community.name,
      })),
    );
  }

  const floorPlans = mappedCommunities.flatMap((community) => asArray(community.floorPlans));

  return {
    builder: mappedBuilder,
    communities: mappedCommunities,
    homes: mappedHomes,
    floorPlans,
  };
}

function findCommunityInSnapshot(communities, criteria = {}) {
  const list = asArray(communities);
  if (!list.length) return null;
  const bySlug = cleanString(criteria.communitySlug);
  const byId = cleanString(criteria.communityId);

  if (bySlug) {
    const normalized = bySlug.toLowerCase();
    const hit = list.find((community) => cleanString(community.slug)?.toLowerCase() === normalized);
    if (hit) return hit;
  }
  if (byId) {
    const normalized = byId.toLowerCase();
    const hit = list.find((community) =>
      [community.id, community.keepupCommunityId, community.slug]
        .map((value) => cleanString(value)?.toLowerCase())
        .includes(normalized),
    );
    if (hit) return hit;
  }
  if (bySlug) {
    const normalized = bySlug.toLowerCase();
    const hit = list.find((community) => slugify(community.name) === normalized);
    if (hit) return hit;
  }
  if (byId) {
    const normalized = byId.toLowerCase();
    const hit = list.find((community) => slugify(community.name) === normalized);
    if (hit) return hit;
  }
  return null;
}

module.exports = {
  mapBuilderSnapshot,
  findCommunityInSnapshot,
};
