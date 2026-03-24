const express = require("express");
const mongoose = require("mongoose");
const BuilderProfile = require("../models/BuilderProfile");
const BuilderInCommunity = require("../models/BuilderInCommunity");
const PlanCatalog = require("../models/PlanCatalog");
const CommunityPlanOffering = require("../models/CommunityPlanOffering");
const PublicHome = require("../models/PublicHome");
const {
  requireInternalApiKey,
  requireInternalApiKeyOrNonProd,
} = require("../middleware/requireInternalApiKey");
const {
  resolveOrCreatePublicCommunity,
  COMMUNITY_COLLECTION_CANDIDATES,
} = require("../../shared/communityResolver");
const {
  hasCommunityDetailsInput,
  normalizeCommunityDetails,
} = require("../../shared/communityDetails");
const {
  normalizeCommunityAmenitiesForRender,
  normalizeCommunityProductTypesForRender,
} = require("../../shared/publicCommunityView");
const {
  normalizePromo,
} = require("../../shared/promo");
const {
  normalizePublicSlug,
} = require("../../shared/publicSlug");

const router = express.Router();

const VISIBILITY_VALUES = ["hidden", "public", "gated"];
const COMMISSION_UNIT_VALUES = ["percent", "flat", "unknown"];
const PRICE_VISIBILITY_VALUES = ["hidden", "public"];
const PUBLIC_HOME_SOURCE_TYPES = ["keepup", "scraper", "manual"];
const KEEPUP_SOURCE_TYPE = "keepup";
const PROMO_MODE_VALUES = ["add", "override"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function parseObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!mongoose.Types.ObjectId.isValid(normalized)) return null;
  return new mongoose.Types.ObjectId(normalized);
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toValidDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizePublishedMediaUrl(value) {
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

function cleanOptionalString(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

function pickStringPatchValue(incomingValue, existingValue) {
  if (incomingValue === undefined) return undefined;
  const incoming = cleanOptionalString(incomingValue);
  if (incoming) return incoming;
  const existing = cleanOptionalString(existingValue);
  if (existing) return existing;
  return incoming;
}

function buildFormattedAddress(address1, city, state, postalCode) {
  const line1 = cleanOptionalString(address1);
  const cleanCity = cleanOptionalString(city);
  const cleanState = cleanOptionalString(state);
  const cleanPostalCode = cleanOptionalString(postalCode);
  const region = [cleanState, cleanPostalCode].filter(Boolean).join(" ");
  const formatted = [line1, cleanCity, region].filter(Boolean).join(", ");
  return formatted || null;
}

function getPublicHomeSourceType(source) {
  if (!source) return "";
  if (typeof source === "string") return source.trim().toLowerCase();
  if (isPlainObject(source) && typeof source.type === "string") {
    return source.type.trim().toLowerCase();
  }
  return "";
}

function isKeepupOwnedPublicHomeDoc(doc) {
  if (!doc || !isPlainObject(doc)) return false;
  const sourceType = getPublicHomeSourceType(doc.source);
  if (sourceType) {
    return sourceType === KEEPUP_SOURCE_TYPE;
  }
  if (typeof doc.keepupListingId === "string" && doc.keepupListingId.trim()) return true;
  if (typeof doc.keepupLotId === "string" && doc.keepupLotId.trim()) return true;
  if (
    typeof doc.sourceHomeId === "string" &&
    doc.sourceHomeId.trim() &&
    (doc.stableId === undefined || doc.stableId === null || doc.stableId === "")
  ) {
    return true;
  }
  return false;
}

function keepupOwnedPublicHomeFilter() {
  return {
    $or: [
      { "source.type": KEEPUP_SOURCE_TYPE },
      { source: KEEPUP_SOURCE_TYPE },
      {
        $and: [
          { $or: [{ source: { $exists: false } }, { source: null }] },
          {
            $or: [
              { keepupListingId: { $exists: true, $type: "string", $ne: "" } },
              { keepupLotId: { $exists: true, $type: "string", $ne: "" } },
              {
                $and: [
                  { sourceHomeId: { $exists: true, $type: "string", $ne: "" } },
                  {
                    $or: [
                      { stableId: { $exists: false } },
                      { stableId: null },
                      { stableId: "" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function keepupBundleDebugEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.DEBUG_KEEPUP_BUNDLE === "1";
}

function logKeepupBundleDebug(event, payload) {
  if (!keepupBundleDebugEnabled()) return;
  try {
    console.info(event, JSON.stringify(payload));
  } catch (_err) {
    console.info(event, payload);
  }
}

function normalizeKeepupCommunityScopeValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildKeepupCommunityScopeFilter(keepupCommunityId) {
  const normalized = normalizeKeepupCommunityScopeValue(keepupCommunityId);
  if (normalized) {
    return { keepupCommunityId: normalized };
  }
  return {
    $or: [
      { keepupCommunityId: { $exists: false } },
      { keepupCommunityId: null },
      { keepupCommunityId: "" },
    ],
  };
}

function sanitizeByRule(value, rule, errors, path) {
  if (value === null) return null;
  if (rule === "string") {
    if (typeof value !== "string") {
      errors.push(`${path} must be a string or null`);
      return undefined;
    }
    return value.trim();
  }
  if (rule === "boolean") {
    if (typeof value !== "boolean") {
      errors.push(`${path} must be a boolean or null`);
      return undefined;
    }
    return value;
  }
  if (rule === "number") {
    const n = toNumber(value);
    if (n === null) {
      errors.push(`${path} must be a number or null`);
      return undefined;
    }
    return n;
  }
  if (rule === "date") {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      errors.push(`${path} must be a valid ISO date or null`);
      return undefined;
    }
    return d;
  }
  if (Array.isArray(rule) && rule[0] === "enum") {
    if (typeof value !== "string") {
      errors.push(`${path} must be one of ${rule[1].join(", ")}`);
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (!rule[1].includes(normalized)) {
      errors.push(`${path} must be one of ${rule[1].join(", ")}`);
      return undefined;
    }
    return normalized;
  }
  if (Array.isArray(rule) && rule[0] === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array or null`);
      return undefined;
    }
    const itemRule = rule[1];
    const out = [];
    value.forEach((item, index) => {
      if (itemRule === "string") {
        if (typeof item !== "string") {
          errors.push(`${path}[${index}] must be a string`);
          return;
        }
        out.push(item.trim());
        return;
      }
      if (!isPlainObject(item)) {
        errors.push(`${path}[${index}] must be an object`);
        return;
      }
      const nested = sanitizeBySpec(item, itemRule, errors, `${path}[${index}]`);
      if (nested && Object.keys(nested).length) out.push(nested);
    });
    return out;
  }
  if (Array.isArray(rule) && rule[0] === "object") {
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object or null`);
      return undefined;
    }
    return sanitizeBySpec(value, rule[1], errors, path);
  }
  return undefined;
}

function sanitizeBySpec(raw, spec, errors, path) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  Object.keys(spec).forEach((key) => {
    if (!hasOwn(raw, key)) return;
    const sanitized = sanitizeByRule(raw[key], spec[key], errors, `${path}.${key}`);
    if (sanitized !== undefined) out[key] = sanitized;
  });
  return out;
}

const BUILDER_PROFILE_SPEC = {
  builderName: "string",
  builderSlug: "string",
  description: "string",
  website: "string",
  logoUrl: "string",
  primaryColor: "string",
  secondaryColor: "string",
  pricingDisclaimer: "string",
};

const BUILDER_IN_COMMUNITY_SPEC = {
  keepupCommunityId: "string",
  builder: ["object", { name: "string", slug: "string" }],
  webData: ["object", {
    primaryContact: ["object", { name: "string", phone: "string", email: "string" }],
    contactVisibility: ["object", { showName: "boolean", showPhone: "boolean", showEmail: "boolean" }],
    totalLots: "number",
    schools: ["object", { elementary: "string", middle: "string", high: "string" }],
    hoa: ["object", { amount: "number", cadence: "string" }],
    taxRate: "number",
    mudTaxRate: "number",
    hasPID: "boolean",
    hasMUD: "boolean",
    mudFeeAmount: "number",
    pidFeeAmount: "number",
    pidFeeFrequency: "string",
    earnestMoney: ["object", { amount: "number", visibility: ["enum", VISIBILITY_VALUES] }],
    realtorCommission: ["object", { amount: "number", unit: ["enum", COMMISSION_UNIT_VALUES], visibility: ["enum", VISIBILITY_VALUES] }],
    notesInternal: "string",
  }],
  presentation: ["object", { heroImageUrl: "string", description: "string", promotion: "string" }],
  visibility: ["object", { isPublished: "boolean" }],
  modelsSummary: ["array", { address: "string", listingId: "string", floorPlanName: "string" }],
};

const BUILDER_IN_COMMUNITY_PUBLIC_COMMUNITY_SPEC = {
  slug: "string",
  name: "string",
  city: "string",
  state: "string",
  location: ["object", { lat: "number", lng: "number" }],
  coordinates: ["object", { lat: "number", lng: "number" }],
  lat: "number",
  lng: "number",
};

const PUBLIC_COMMUNITY_SPEC = {
  keepupCommunityId: "string",
  canonicalKey: "string",
  slug: "string",
  name: "string",
  city: "string",
  state: "string",
  location: ["object", { lat: "number", lng: "number" }],
  coordinates: ["object", { lat: "number", lng: "number" }],
  lat: "number",
  lng: "number",
  overview: "string",
  highlights: ["array", "string"],
  heroImageUrl: "string",
  imageUrls: ["array", "string"],
  hoaMonthly: "number",
  taxRate: "number",
  mudTaxRate: "number",
  mudFeeAmount: "number",
  pid: "boolean",
  mud: "boolean",
  taxDistrict: "string",
  hoaIncludes: ["array", "string"],
  fees: ["object", {
    hoaMonthly: "number",
    hoaFee: "number",
    taxRate: "number",
    mudTaxRate: "number",
    mudFee: "number",
    mudFeeAmount: "number",
    pid: "boolean",
    mud: "boolean",
    hasPid: "boolean",
    hasMud: "boolean",
    taxDistrict: "string",
    hoaIncludes: ["array", "string"],
  }],
};

const PLAN_CATALOG_SPEC = {
  name: "string",
  slug: "string",
  beds: "number",
  baths: "number",
  halfBaths: "number",
  sqft: "number",
  stories: "number",
  garage: "string",
  garageSpaces: "number",
  description: "string",
  features: ["array", "string"],
  images: ["array", { url: "string", width: "number", height: "number", alt: "string" }],
  asset: ["object", {
    fileUrl: "string",
    previewUrl: "string",
    originalFilename: "string",
    mimeType: "string",
  }],
  primaryImageUrl: "string",
  productType: "string",
};

const PLAN_OFFERING_SPEC = {
  keepupCommunityId: "string",
  isIncluded: "boolean",
  sortOrder: "number",
  basePriceFrom: "number",
  basePriceAsOf: "date",
  basePriceVisibility: ["enum", PRICE_VISIBILITY_VALUES],
  basePriceNotesInternal: "string",
  descriptionOverride: "string",
  primaryImageOverrideUrl: "string",
  badges: ["array", "string"],
};

const PUBLIC_HOME_SPEC = {
  stableId: "string",
  keepupCommunityId: "string",
  keepupListingId: "string",
  keepupLotId: "string",
  keepupFloorPlanId: "string",
  address1: "string",
  city: "string",
  state: "string",
  postalCode: "string",
  formattedAddress: "string",
  source: ["object", {
    type: ["enum", PUBLIC_HOME_SOURCE_TYPES],
    provider: "string",
    externalId: "string",
    ingestedAt: "date",
    updatedAt: "date",
    updatedBy: "string",
  }],
  address: ["object", { line1: "string", city: "string", state: "string", zip: "string" }],
  geo: ["object", { lat: "number", lng: "number" }],
  status: "string",
  price: ["object", { list: "number", sale: "number" }],
  beds: "number",
  baths: "number",
  sqft: "number",
  lotSize: "string",
  garage: "string",
  marketing: ["object", { headline: "string", description: "string", features: ["array", "string"] }],
  promoMode: ["enum", PROMO_MODE_VALUES],
  photos: ["array", { url: "string", width: "number", height: "number", alt: "string", sortOrder: "number" }],
  primaryPhotoUrl: "string",
  isActive: "boolean",
};

function sanitizeBuilderProfile(rawProfile, errors) {
  if (rawProfile === undefined || rawProfile === null) return null;
  if (!isPlainObject(rawProfile)) {
    errors.push("builderProfile must be an object");
    return null;
  }
  const companyId = parseObjectId(rawProfile.companyId);
  if (!companyId) {
    errors.push("builderProfile.companyId must be a valid ObjectId");
    return null;
  }
  const patch = sanitizeBySpec(rawProfile, BUILDER_PROFILE_SPEC, errors, "builderProfile");
  if (hasOwn(patch, "builderSlug") && patch.builderSlug !== null) {
    patch.builderSlug = normalizePublicSlug(patch.builderSlug);
  }
  return {
    companyId,
    companyIdString: companyId.toString(),
    patch,
  };
}

function sanitizeBuilderInCommunity(rawEntry, index, errors) {
  if (!isPlainObject(rawEntry)) {
    errors.push(`builderInCommunities[${index}] must be an object`);
    return null;
  }
  const companyId = parseObjectId(rawEntry.companyId);
  if (!companyId) {
    errors.push(`builderInCommunities[${index}].companyId must be a valid ObjectId`);
    return null;
  }
  const publicCommunityId = parseObjectId(rawEntry.publicCommunityId);
  if (!publicCommunityId) {
    errors.push(`builderInCommunities[${index}].publicCommunityId must be a valid ObjectId`);
    return null;
  }
  const patch = sanitizeBySpec(rawEntry, BUILDER_IN_COMMUNITY_SPEC, errors, `builderInCommunities[${index}]`);
  const communityPatch = sanitizeBySpec(
    rawEntry,
    BUILDER_IN_COMMUNITY_PUBLIC_COMMUNITY_SPEC,
    errors,
    `builderInCommunities[${index}]`,
  );
  if (patch.builder && hasOwn(patch.builder, "slug") && patch.builder.slug !== null) {
    patch.builder.slug = normalizePublicSlug(patch.builder.slug);
  }
  if (hasOwn(communityPatch, "slug") && communityPatch.slug !== null) {
    communityPatch.slug = normalizePublicSlug(communityPatch.slug);
  }
  if (patch.webData?.contactVisibility && !hasOwn(patch.webData.contactVisibility, "showEmail")) {
    patch.webData.contactVisibility.showEmail = false;
  }
  if (patch.webData?.earnestMoney && !hasOwn(patch.webData.earnestMoney, "visibility")) {
    patch.webData.earnestMoney.visibility = "hidden";
  }
  if (patch.webData?.realtorCommission && !hasOwn(patch.webData.realtorCommission, "visibility")) {
    patch.webData.realtorCommission.visibility = "hidden";
  }
  const rawWebData = isPlainObject(rawEntry.webData) ? rawEntry.webData : null;
  const rawAmenities =
    rawWebData && hasOwn(rawWebData, "amenities")
      ? rawWebData.amenities
      : rawWebData && hasOwn(rawWebData, "ammenities")
        ? rawWebData.ammenities
        : undefined;
  const rawPromo =
    rawWebData && hasOwn(rawWebData, "promo")
      ? rawWebData.promo
      : undefined;
  const rawProductTypes =
    rawWebData && hasOwn(rawWebData, "productTypes")
      ? rawWebData.productTypes
      : undefined;
  if (rawAmenities !== undefined) {
    if (!patch.webData) patch.webData = {};
    patch.webData.amenities = normalizeCommunityAmenitiesForRender(rawAmenities);
  }
  if (rawProductTypes !== undefined) {
    if (!patch.webData) patch.webData = {};
    patch.webData.productTypes = normalizeCommunityProductTypesForRender(rawProductTypes);
  }
  if (rawPromo !== undefined) {
    if (!patch.webData) patch.webData = {};
    patch.webData.promo = normalizePromo(rawPromo);
  }
  return {
    companyId,
    companyIdString: companyId.toString(),
    publicCommunityId,
    publicCommunityIdString: publicCommunityId.toString(),
    patch,
    communityPatch,
  };
}

function sanitizePublicCommunity(rawEntry, index, errors) {
  if (!isPlainObject(rawEntry)) {
    errors.push(`communities[${index}] must be an object`);
    return null;
  }
  const publicCommunityId = parseObjectId(
    rawEntry.publicCommunityId || rawEntry._id || rawEntry.id,
  );
  if (!publicCommunityId) {
    errors.push(`communities[${index}].publicCommunityId must be a valid ObjectId`);
    return null;
  }
  const patch = sanitizeBySpec(rawEntry, PUBLIC_COMMUNITY_SPEC, errors, `communities[${index}]`);
  if (hasOwn(patch, "slug") && patch.slug !== null) {
    patch.slug = normalizePublicSlug(patch.slug);
  }
  if (hasOwn(patch, "highlights") && patch.highlights === null) {
    patch.highlights = [];
  }
  if (hasOwn(patch, "imageUrls") && patch.imageUrls === null) {
    patch.imageUrls = [];
  }
  if (hasCommunityDetailsInput(rawEntry)) {
    patch.communityDetails = normalizeCommunityDetails(rawEntry);
  }
  return {
    publicCommunityId,
    publicCommunityIdString: publicCommunityId.toString(),
    patch,
  };
}

function sanitizePlanCatalog(rawEntry, index, errors) {
  if (!isPlainObject(rawEntry)) {
    errors.push(`planCatalog[${index}] must be an object`);
    return null;
  }
  const companyId = parseObjectId(rawEntry.companyId);
  if (!companyId) {
    errors.push(`planCatalog[${index}].companyId must be a valid ObjectId`);
    return null;
  }
  const keepupFloorPlanId =
    typeof rawEntry.keepupFloorPlanId === "string" ? rawEntry.keepupFloorPlanId.trim() : "";
  if (!keepupFloorPlanId) {
    errors.push(`planCatalog[${index}].keepupFloorPlanId is required`);
    return null;
  }
  const patch = sanitizeBySpec(rawEntry, PLAN_CATALOG_SPEC, errors, `planCatalog[${index}]`);
  if (hasOwn(patch, "slug") && patch.slug !== null) {
    patch.slug = normalizePublicSlug(patch.slug);
  }
  if (hasOwn(patch, "name") && !patch.name) {
    errors.push(`planCatalog[${index}].name cannot be empty`);
  }
  return {
    companyId,
    companyIdString: companyId.toString(),
    keepupFloorPlanId,
    patch,
  };
}

function sanitizePlanOffering(rawEntry, index, errors) {
  if (!isPlainObject(rawEntry)) {
    errors.push(`planOfferings[${index}] must be an object`);
    return null;
  }
  const companyId = parseObjectId(rawEntry.companyId);
  if (!companyId) {
    errors.push(`planOfferings[${index}].companyId must be a valid ObjectId`);
    return null;
  }
  const publicCommunityId = parseObjectId(rawEntry.publicCommunityId);
  if (!publicCommunityId) {
    errors.push(`planOfferings[${index}].publicCommunityId must be a valid ObjectId`);
    return null;
  }
  const keepupFloorPlanId =
    typeof rawEntry.keepupFloorPlanId === "string" ? rawEntry.keepupFloorPlanId.trim() : "";
  if (!keepupFloorPlanId) {
    errors.push(`planOfferings[${index}].keepupFloorPlanId is required`);
    return null;
  }
  const patch = sanitizeBySpec(rawEntry, PLAN_OFFERING_SPEC, errors, `planOfferings[${index}]`);
  if (hasOwn(patch, "basePriceFrom") && patch.basePriceFrom !== null && patch.basePriceFrom < 0) {
    errors.push(`planOfferings[${index}].basePriceFrom must be >= 0`);
  }
  return {
    companyId,
    companyIdString: companyId.toString(),
    publicCommunityId,
    publicCommunityIdString: publicCommunityId.toString(),
    keepupFloorPlanId,
    patch,
  };
}

function sanitizePublicHome(rawEntry, index, errors) {
  if (!isPlainObject(rawEntry)) {
    errors.push(`publicHomes[${index}] must be an object`);
    return null;
  }
  const companyId = parseObjectId(rawEntry.companyId);
  if (!companyId) {
    errors.push(`publicHomes[${index}].companyId must be a valid ObjectId`);
    return null;
  }
  const publicCommunityId = parseObjectId(rawEntry.publicCommunityId);
  if (!publicCommunityId) {
    errors.push(`publicHomes[${index}].publicCommunityId must be a valid ObjectId`);
    return null;
  }

  const keepupListingId =
    typeof rawEntry.keepupListingId === "string" ? rawEntry.keepupListingId.trim() : "";
  const keepupLotId =
    typeof rawEntry.keepupLotId === "string" ? rawEntry.keepupLotId.trim() : "";
  const sourceHomeId = keepupListingId || keepupLotId;
  if (!sourceHomeId) {
    errors.push({
      code: "HOME_ID_REQUIRED",
      message: `publicHomes[${index}] requires keepupListingId or keepupLotId`,
      index,
    });
    return null;
  }

  const patch = sanitizeBySpec(rawEntry, PUBLIC_HOME_SPEC, errors, `publicHomes[${index}]`);
  if (hasOwn(rawEntry, "promo")) {
    patch.promo = normalizePromo(rawEntry.promo);
  }
  const stableId = patch.stableId || sourceHomeId;

  if (patch.stableId && patch.stableId !== sourceHomeId) {
    errors.push(`publicHomes[${index}].stableId must match keepupListingId or keepupLotId for keepup publish`);
  }
  if (patch.source?.type && patch.source.type !== KEEPUP_SOURCE_TYPE) {
    errors.push(`publicHomes[${index}].source.type must be keepup for this endpoint`);
  }

  ["beds", "baths", "sqft"].forEach((field) => {
    if (hasOwn(patch, field) && patch[field] !== null && patch[field] < 0) {
      errors.push(`publicHomes[${index}].${field} must be >= 0`);
    }
  });

  if (patch.price && patch.price !== null) {
    ["list", "sale"].forEach((field) => {
      if (hasOwn(patch.price, field) && patch.price[field] !== null && patch.price[field] < 0) {
        errors.push(`publicHomes[${index}].price.${field} must be >= 0`);
      }
    });
  }

  if (Array.isArray(patch.photos)) {
    patch.photos.forEach((photo, photoIndex) => {
      if (!photo?.url) {
        errors.push(`publicHomes[${index}].photos[${photoIndex}].url is required`);
      }
      ["width", "height", "sortOrder"].forEach((field) => {
        if (hasOwn(photo, field) && photo[field] !== null && photo[field] < 0) {
          errors.push(`publicHomes[${index}].photos[${photoIndex}].${field} must be >= 0`);
        }
      });
    });
    patch.photos = patch.photos.map((photo) => {
      const normalizedUrl = normalizePublishedMediaUrl(photo.url);
      return normalizedUrl ? { ...photo, url: normalizedUrl } : photo;
    });
  }

  if (hasOwn(patch, "primaryPhotoUrl") && patch.primaryPhotoUrl) {
    patch.primaryPhotoUrl = normalizePublishedMediaUrl(patch.primaryPhotoUrl) || patch.primaryPhotoUrl;
  }

  return {
    companyId,
    companyIdString: companyId.toString(),
    publicCommunityId,
    publicCommunityIdString: publicCommunityId.toString(),
    stableId,
    sourceHomeId,
    keepupListingId,
    keepupLotId,
    keepupFloorPlanId: patch.keepupFloorPlanId || "",
    patch,
  };
}

function formatValidationError(err) {
  if (typeof err === "string") {
    return { code: "VALIDATION_ERROR", message: err };
  }
  if (isPlainObject(err) && typeof err.message === "string") {
    return { ...err };
  }
  return { code: "VALIDATION_ERROR", message: String(err) };
}

function publicHomeKey(companyIdString, sourceHomeId) {
  return `${companyIdString}::${sourceHomeId}`;
}

function publicHomeStableKey(stableId) {
  return String(stableId || "").trim();
}

function publicHomeScopeKey(companyIdString, publicCommunityIdString, keepupCommunityId) {
  const scopeId = normalizeKeepupCommunityScopeValue(keepupCommunityId) || "__missing_keepupCommunityId__";
  return `${companyIdString}::${publicCommunityIdString}::${scopeId}`;
}

function buildPublicHomeSourceDoc(entry, publishedAt, existingDoc) {
  const incomingSource = isPlainObject(entry.patch?.source) ? entry.patch.source : {};
  const existingSource = isPlainObject(existingDoc?.source) ? existingDoc.source : {};
  const ingestedAt =
    toValidDate(existingSource.ingestedAt) ||
    toValidDate(incomingSource.ingestedAt) ||
    publishedAt;
  const updatedAt =
    toValidDate(incomingSource.updatedAt) ||
    publishedAt;

  return {
    type: KEEPUP_SOURCE_TYPE,
    ...(incomingSource.provider || existingSource.provider
      ? { provider: incomingSource.provider || existingSource.provider }
      : {}),
    externalId:
      incomingSource.externalId ||
      existingSource.externalId ||
      entry.sourceHomeId,
    ingestedAt,
    updatedAt,
    updatedBy:
      incomingSource.updatedBy ||
      existingSource.updatedBy ||
      "system",
  };
}

function buildPublicHomeSetDoc(entry, planCatalogId, publishedAt, existingDoc) {
  const patch = entry.patch || {};
  const setDoc = {
    stableId: entry.stableId,
    publicCommunityId: entry.publicCommunityId,
    sourceHomeId: entry.sourceHomeId,
    source: buildPublicHomeSourceDoc(entry, publishedAt, existingDoc),
    lastPublishedAt: publishedAt,
  };

  if (entry.keepupListingId) {
    setDoc.keepupListingId = entry.keepupListingId;
  }
  if (entry.keepupLotId) {
    setDoc.keepupLotId = entry.keepupLotId;
  }

  if (hasOwn(patch, "keepupCommunityId")) setDoc.keepupCommunityId = patch.keepupCommunityId;
  if (hasOwn(patch, "keepupFloorPlanId")) setDoc.keepupFloorPlanId = patch.keepupFloorPlanId;

  const hasAddressObjectPatch = hasOwn(patch, "address");
  const hasAddressLinePatch = hasOwn(patch, "address1");
  const hasCityPatch = hasOwn(patch, "city");
  const hasStatePatch = hasOwn(patch, "state");
  const hasPostalCodePatch = hasOwn(patch, "postalCode");
  const hasFormattedAddressPatch = hasOwn(patch, "formattedAddress");
  const hasSplitAddressPatch =
    hasAddressObjectPatch ||
    hasAddressLinePatch ||
    hasCityPatch ||
    hasStatePatch ||
    hasPostalCodePatch ||
    hasFormattedAddressPatch;

  if (hasSplitAddressPatch) {
    const existingAddress = isPlainObject(existingDoc?.address) ? existingDoc.address : {};
    const existingAddress1 =
      existingDoc?.address1 ||
      existingDoc?.addressLine1 ||
      existingAddress.line1 ||
      existingAddress.street ||
      null;
    const existingCity = existingDoc?.city || existingAddress.city || null;
    const existingState = existingDoc?.state || existingAddress.state || null;
    const existingPostalCode = existingDoc?.postalCode || existingAddress.zip || null;
    const existingFormattedAddress = existingDoc?.formattedAddress || null;

    const incomingAddress1 = hasAddressLinePatch
      ? patch.address1
      : (patch.address && isPlainObject(patch.address) && hasOwn(patch.address, "line1")
        ? patch.address.line1
        : undefined);
    const incomingCity = hasCityPatch
      ? patch.city
      : (patch.address && isPlainObject(patch.address) && hasOwn(patch.address, "city")
        ? patch.address.city
        : undefined);
    const incomingState = hasStatePatch
      ? patch.state
      : (patch.address && isPlainObject(patch.address) && hasOwn(patch.address, "state")
        ? patch.address.state
        : undefined);
    const incomingPostalCode = hasPostalCodePatch
      ? patch.postalCode
      : (patch.address && isPlainObject(patch.address) && hasOwn(patch.address, "zip")
        ? patch.address.zip
        : undefined);

    const nextAddress1 = incomingAddress1 === undefined
      ? cleanOptionalString(existingAddress1)
      : pickStringPatchValue(incomingAddress1, existingAddress1);
    const nextCity = incomingCity === undefined
      ? cleanOptionalString(existingCity)
      : pickStringPatchValue(incomingCity, existingCity);
    const nextState = incomingState === undefined
      ? cleanOptionalString(existingState)
      : pickStringPatchValue(incomingState, existingState);
    const nextPostalCode = incomingPostalCode === undefined
      ? cleanOptionalString(existingPostalCode)
      : pickStringPatchValue(incomingPostalCode, existingPostalCode);

    const normalizedAddress = {};
    if (nextAddress1) {
      normalizedAddress.line1 = nextAddress1;
      normalizedAddress.street = nextAddress1;
    }
    if (nextCity) normalizedAddress.city = nextCity;
    if (nextState) normalizedAddress.state = nextState;
    if (nextPostalCode) normalizedAddress.zip = nextPostalCode;

    setDoc.address = Object.keys(normalizedAddress).length ? normalizedAddress : null;
    setDoc.address1 = nextAddress1;
    setDoc.addressLine1 = nextAddress1;
    setDoc.city = nextCity;
    setDoc.state = nextState;
    setDoc.postalCode = nextPostalCode;

    if (hasFormattedAddressPatch) {
      setDoc.formattedAddress = pickStringPatchValue(patch.formattedAddress, existingFormattedAddress);
    } else {
      setDoc.formattedAddress = buildFormattedAddress(nextAddress1, nextCity, nextState, nextPostalCode);
    }
  }

  if (hasOwn(patch, "geo")) {
    if (patch.geo === null) {
      setDoc.geo = null;
      setDoc.coordinates = null;
      setDoc.location = null;
      setDoc.lat = null;
      setDoc.lng = null;
    } else {
      const geo = {};
      if (hasOwn(patch.geo, "lat")) {
        geo.lat = patch.geo.lat;
        setDoc.lat = patch.geo.lat;
      }
      if (hasOwn(patch.geo, "lng")) {
        geo.lng = patch.geo.lng;
        setDoc.lng = patch.geo.lng;
      }
      setDoc.geo = geo;
      setDoc.coordinates = geo;
      setDoc.location = geo;
    }
  }

  if (hasOwn(patch, "status")) {
    setDoc.status = patch.status;
    setDoc.generalStatus = patch.status;
  }

  if (hasOwn(patch, "price")) {
    if (patch.price === null) {
      setDoc.price = null;
      setDoc.listPrice = null;
      setDoc.salePrice = null;
    } else {
      if (hasOwn(patch.price, "list")) {
        setDoc.price = patch.price.list;
        setDoc.listPrice = patch.price.list;
      }
      if (hasOwn(patch.price, "sale")) {
        setDoc.salePrice = patch.price.sale;
      }
    }
  }

  ["beds", "baths", "sqft", "lotSize", "garage"].forEach((field) => {
    if (hasOwn(patch, field)) {
      setDoc[field] = patch[field];
    }
  });

  if (hasOwn(patch, "marketing")) {
    if (patch.marketing === null) {
      setDoc.marketing = null;
      setDoc.title = null;
      setDoc.description = null;
      setDoc.highlights = null;
      setDoc.features = null;
    } else {
      setDoc.marketing = patch.marketing;
      if (hasOwn(patch.marketing, "headline")) setDoc.title = patch.marketing.headline;
      if (hasOwn(patch.marketing, "description")) setDoc.description = patch.marketing.description;
      if (hasOwn(patch.marketing, "features")) {
        setDoc.features = patch.marketing.features;
        setDoc.highlights = Array.isArray(patch.marketing.features)
          ? patch.marketing.features.join(", ")
          : null;
      }
    }
  }

  if (hasOwn(patch, "promo")) {
    setDoc.promo = patch.promo;
  }
  if (hasOwn(patch, "promoMode")) {
    setDoc.promoMode = patch.promoMode;
  }

  let firstPhotoUrl = null;
  if (hasOwn(patch, "photos")) {
    if (patch.photos === null) {
      setDoc.photos = null;
      setDoc.images = null;
      setDoc.heroImages = null;
      firstPhotoUrl = null;
    } else {
      const photos = [...patch.photos].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const imageUrls = photos.map((photo) => photo.url).filter(Boolean);
      setDoc.photos = photos;
      setDoc.images = imageUrls;
      setDoc.heroImages = imageUrls;
      firstPhotoUrl = imageUrls[0] || null;
    }
  }

  if (hasOwn(patch, "primaryPhotoUrl")) {
    const normalizedPrimaryPhotoUrl = patch.primaryPhotoUrl
      ? normalizePublishedMediaUrl(patch.primaryPhotoUrl) || patch.primaryPhotoUrl
      : patch.primaryPhotoUrl;
    setDoc.primaryPhotoUrl = normalizedPrimaryPhotoUrl;
    setDoc.heroImage = normalizedPrimaryPhotoUrl || firstPhotoUrl;
  } else if (hasOwn(patch, "photos")) {
    setDoc.heroImage = firstPhotoUrl;
  }

  if (hasOwn(patch, "isActive")) {
    setDoc.isActive = patch.isActive;
    setDoc.published = patch.isActive;
  }

  if (hasOwn(patch, "keepupFloorPlanId")) {
    setDoc.planCatalogId = planCatalogId || null;
  }

  return setDoc;
}

function flattenIntoSet(prefix, value, target) {
  if (value === undefined) return;
  if (
    value === null ||
    Array.isArray(value) ||
    value instanceof Date ||
    value instanceof mongoose.Types.ObjectId ||
    !isPlainObject(value)
  ) {
    target[prefix] = value;
    return;
  }
  const keys = Object.keys(value);
  if (!keys.length) {
    target[prefix] = {};
    return;
  }
  keys.forEach((key) => flattenIntoSet(`${prefix}.${key}`, value[key], target));
}

function buildSetDoc(patch) {
  const out = {};
  Object.keys(patch || {}).forEach((key) => flattenIntoSet(key, patch[key], out));
  return out;
}

function getDebugPlanCatalogId() {
  const value = typeof process.env.BRZ_DEBUG_PLAN_CATALOG_ID === "string"
    ? process.env.BRZ_DEBUG_PLAN_CATALOG_ID.trim()
    : "";
  return value || null;
}

function shouldDebugPlanCatalog(catalogIdString) {
  const debugPlanCatalogId = getDebugPlanCatalogId();
  if (!debugPlanCatalogId) return false;
  if (process.env.NODE_ENV === "production") return false;
  return String(catalogIdString || "") === debugPlanCatalogId;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function mergePlanOfferingPatches(existingPatch, incomingPatch) {
  const merged = {
    ...(isPlainObject(existingPatch) ? existingPatch : {}),
    ...(isPlainObject(incomingPatch) ? incomingPatch : {}),
  };

  const existingHasPrice = isPlainObject(existingPatch) && hasOwn(existingPatch, "basePriceFrom");
  const incomingHasPrice = isPlainObject(incomingPatch) && hasOwn(incomingPatch, "basePriceFrom");
  if (!existingHasPrice && !incomingHasPrice) {
    return merged;
  }

  const existingPrice = existingHasPrice ? existingPatch.basePriceFrom : undefined;
  const incomingPrice = incomingHasPrice ? incomingPatch.basePriceFrom : undefined;

  if (isFiniteNumber(incomingPrice)) {
    merged.basePriceFrom = incomingPrice;
  } else if (isFiniteNumber(existingPrice)) {
    merged.basePriceFrom = existingPrice;
  } else if (incomingHasPrice) {
    merged.basePriceFrom = incomingPrice;
  } else {
    merged.basePriceFrom = existingPrice;
  }

  return merged;
}

function normalizeHoaMonthlyFromWebData(hoa) {
  if (!isPlainObject(hoa) || !hasOwn(hoa, "amount")) return undefined;
  if (hoa.amount === null) return null;
  if (typeof hoa.amount !== "number" || !Number.isFinite(hoa.amount)) return undefined;

  const cadence = typeof hoa.cadence === "string" ? hoa.cadence.trim().toLowerCase() : "";
  if (!cadence || ["monthly", "month", "mo", "per month"].includes(cadence)) {
    return hoa.amount;
  }
  if (["annual", "annually", "yearly", "year", "yr", "per year"].includes(cadence)) {
    return Number((hoa.amount / 12).toFixed(2));
  }
  return undefined;
}

function derivePublicCommunityPatchFromBuilderInCommunity(entryPatch) {
  const webData = isPlainObject(entryPatch?.webData) ? entryPatch.webData : null;
  const communityInput = isPlainObject(entryPatch?.communityPatch) ? entryPatch.communityPatch : {};

  const patch = {};
  const fees = {};
  const hoaMonthly = normalizeHoaMonthlyFromWebData(webData?.hoa);
  const rawAmenities =
    hasOwn(webData || {}, "amenities")
      ? webData.amenities
      : hasOwn(webData || {}, "ammenities")
        ? webData.ammenities
        : undefined;
  const rawProductTypes =
    hasOwn(webData || {}, "productTypes")
      ? webData.productTypes
      : undefined;

  if (hasOwn(entryPatch || {}, "keepupCommunityId")) {
    patch.keepupCommunityId = entryPatch.keepupCommunityId;
  }

  ["slug", "name", "city", "state"].forEach((field) => {
    if (hasOwn(communityInput, field)) {
      patch[field] = communityInput[field];
    }
  });

  const location = isPlainObject(communityInput.location) ? communityInput.location : null;
  const coordinates = isPlainObject(communityInput.coordinates) ? communityInput.coordinates : null;
  const lat = hasOwn(communityInput, "lat")
    ? communityInput.lat
    : hasOwn(location || {}, "lat")
      ? location.lat
      : hasOwn(coordinates || {}, "lat")
        ? coordinates.lat
        : undefined;
  const lng = hasOwn(communityInput, "lng")
    ? communityInput.lng
    : hasOwn(location || {}, "lng")
      ? location.lng
      : hasOwn(coordinates || {}, "lng")
        ? coordinates.lng
        : undefined;

  if (typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)) {
    patch.location = { lat, lng };
    patch.coordinates = { lat, lng };
    patch.lat = lat;
    patch.lng = lng;
  } else {
    if (hasOwn(communityInput, "location")) patch.location = communityInput.location;
    if (hasOwn(communityInput, "coordinates")) patch.coordinates = communityInput.coordinates;
    if (hasOwn(communityInput, "lat")) patch.lat = communityInput.lat;
    if (hasOwn(communityInput, "lng")) patch.lng = communityInput.lng;
  }

  if (hoaMonthly !== undefined) {
    patch.hoaMonthly = hoaMonthly;
    fees.hoaFee = hoaMonthly;
    fees.hoaFrequency = hoaMonthly === null ? null : "monthly";
  }
  if (hasOwn(webData || {}, "taxRate")) {
    patch.taxRate = webData.taxRate;
    fees.tax = webData.taxRate;
    fees.taxRate = webData.taxRate;
  }
  if (hasOwn(webData || {}, "mudTaxRate")) {
    patch.mudTaxRate = webData.mudTaxRate;
    fees.mudTaxRate = webData.mudTaxRate;
  }
  if (hasOwn(webData || {}, "hasPID")) {
    patch.pid = webData.hasPID;
    fees.pid = webData.hasPID;
    fees.hasPid = webData.hasPID;
  }
  if (hasOwn(webData || {}, "hasMUD")) {
    patch.mud = webData.hasMUD;
    fees.mud = webData.hasMUD;
    fees.hasMud = webData.hasMUD;
  }
  if (hasOwn(webData || {}, "pidFeeAmount")) {
    fees.pidFee = webData.pidFeeAmount;
  }
  if (hasOwn(webData || {}, "pidFeeFrequency")) {
    fees.pidFeeFrequency = webData.pidFeeFrequency;
  }
  if (hasOwn(webData || {}, "mudFeeAmount")) {
    patch.mudFeeAmount = webData.mudFeeAmount;
    fees.mudFee = webData.mudFeeAmount;
  }
  if (rawAmenities !== undefined) {
    patch.amenities = normalizeCommunityAmenitiesForRender(rawAmenities);
  }
  if (rawProductTypes !== undefined) {
    patch.productTypes = normalizeCommunityProductTypesForRender(rawProductTypes);
  }
  if (hasOwn(webData || {}, "promo")) {
    patch.promo = normalizePromo(webData.promo);
  }

  if (Object.keys(fees).length) {
    patch.fees = fees;
  }

  return Object.keys(patch).length ? patch : null;
}

function planCatalogKey(companyIdString, keepupFloorPlanId) {
  return `${companyIdString}::${keepupFloorPlanId}`;
}

async function getPublicCommunityCollection(db) {
  const names = (await db.listCollections().toArray()).map((col) => col.name);
  const foundName = COMMUNITY_COLLECTION_CANDIDATES.find((name) => names.includes(name));
  if (!foundName) return null;
  return db.collection(foundName);
}

router.post("/bundle", requireInternalApiKey, async (req, res) => {
  const startedAt = Date.now();
  const warnings = [];
  const validationErrors = [];
  const counts = {
    publicCommunitiesUpserted: 0,
    builderProfileUpserted: 0,
    builderInCommunityUpserted: 0,
    planCatalogUpserted: 0,
    planOfferingsUpserted: 0,
    publicHomesUpserted: 0,
    publicHomesDeactivated: 0,
  };

  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({
        ok: false,
        counts,
        warnings,
        errors: [{ code: "VALIDATION_ERROR", message: "request body must be an object" }],
      });
    }

    const payload = req.body;
    const meta = isPlainObject(payload.meta) ? payload.meta : {};
    const keepupCompanyId = typeof meta.keepupCompanyId === "string" ? meta.keepupCompanyId.trim() : "";
    const unpublishMissingHomes = meta.unpublishMissingHomes === true;
    const requestedAt = toValidDate(meta.requestedAt);
    logKeepupBundleDebug("[internal publish keepup bundle][meta]", {
      keepupCompanyId: keepupCompanyId || null,
      unpublishMissingHomes,
      requestedAt: requestedAt ? requestedAt.toISOString() : null,
      publisherVersion: typeof meta.publisherVersion === "string" ? meta.publisherVersion.trim() || null : null,
      counts: {
        communities: Array.isArray(payload.communities) ? payload.communities.length : 0,
        builderInCommunities: Array.isArray(payload.builderInCommunities) ? payload.builderInCommunities.length : 0,
        planCatalog: Array.isArray(payload.planCatalog) ? payload.planCatalog.length : 0,
        planOfferings: Array.isArray(payload.planOfferings) ? payload.planOfferings.length : 0,
        publicHomes: Array.isArray(payload.publicHomes) ? payload.publicHomes.length : 0,
      },
    });

    const communities = Array.isArray(payload.communities)
      ? payload.communities.map((entry, i) => sanitizePublicCommunity(entry, i, validationErrors)).filter(Boolean)
      : payload.communities === undefined
        ? []
        : (validationErrors.push("communities must be an array"), []);
    const builderProfile = sanitizeBuilderProfile(payload.builderProfile, validationErrors);
    const builderInCommunities = Array.isArray(payload.builderInCommunities)
      ? payload.builderInCommunities.map((entry, i) => sanitizeBuilderInCommunity(entry, i, validationErrors)).filter(Boolean)
      : payload.builderInCommunities === undefined
        ? []
        : (validationErrors.push("builderInCommunities must be an array"), []);
    const planCatalog = Array.isArray(payload.planCatalog)
      ? payload.planCatalog.map((entry, i) => sanitizePlanCatalog(entry, i, validationErrors)).filter(Boolean)
      : payload.planCatalog === undefined
        ? []
        : (validationErrors.push("planCatalog must be an array"), []);
    const planOfferings = Array.isArray(payload.planOfferings)
      ? payload.planOfferings.map((entry, i) => sanitizePlanOffering(entry, i, validationErrors)).filter(Boolean)
      : payload.planOfferings === undefined
        ? []
        : (validationErrors.push("planOfferings must be an array"), []);
    const publicHomes = Array.isArray(payload.publicHomes)
      ? payload.publicHomes.map((entry, i) => sanitizePublicHome(entry, i, validationErrors)).filter(Boolean)
      : payload.publicHomes === undefined
        ? []
        : (validationErrors.push("publicHomes must be an array"), []);

    if (
      (process.env.NODE_ENV !== "production" || process.env.DEBUG_KEEPUP_BUNDLE === "1") &&
      Array.isArray(payload.builderInCommunities) &&
      payload.builderInCommunities.length &&
      isPlainObject(payload.builderInCommunities[0]?.webData)
    ) {
      const firstWebData = payload.builderInCommunities[0].webData;
      const incomingAmenities =
        firstWebData.amenities ??
        firstWebData.ammenities ??
        null;
      console.info(
        "[internal publish keepup bundle] builderInCommunities[0].webData",
        JSON.stringify({
          keys: Object.keys(firstWebData),
          amenities: incomingAmenities,
        }),
      );
    }

    if (builderProfile) {
      const profileCompanyId = builderProfile.companyIdString;
      const mismatched = [...builderInCommunities, ...planCatalog, ...planOfferings, ...publicHomes]
        .some((entry) => entry.companyIdString !== profileCompanyId);
      if (mismatched) {
        validationErrors.push("All companyId values must match builderProfile.companyId when builderProfile is provided");
      }
    }

    if (validationErrors.length) {
      return res.status(400).json({
        ok: false,
        counts,
        warnings,
        errors: validationErrors.map((err) => formatValidationError(err)),
      });
    }

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(500).json({
        ok: false,
        counts,
        warnings,
        errors: [{ code: "INTERNAL_ERROR", message: "Database connection is not ready" }],
      });
    }

    for (const entry of communities) {
      const resolved = await resolveOrCreatePublicCommunity(
        db,
        {
          publicCommunityId: entry.publicCommunityId,
          ...entry.patch,
        },
        { allowCreate: true },
      );
      if (!resolved) {
        return res.status(500).json({
          ok: false,
          counts,
          warnings,
          errors: [{ code: "INTERNAL_ERROR", message: "Failed to upsert PublicCommunity" }],
        });
      }
      counts.publicCommunitiesUpserted += 1;
    }

    const communityIds = Array.from(new Set([
      ...communities.map((e) => e.publicCommunityIdString),
      ...builderInCommunities.map((e) => e.publicCommunityIdString),
      ...planOfferings.map((e) => e.publicCommunityIdString),
      ...publicHomes.map((e) => e.publicCommunityIdString),
    ]));
    if (communityIds.length) {
      const communityCollection = await getPublicCommunityCollection(db);
      if (!communityCollection) {
        return res.status(500).json({
          ok: false,
          counts,
          warnings,
          errors: [{ code: "INTERNAL_ERROR", message: "PublicCommunity collection not found" }],
        });
      }
      const rows = await communityCollection.find(
        { _id: { $in: communityIds.map((id) => new mongoose.Types.ObjectId(id)) } },
        { projection: { _id: 1 } },
      ).toArray();
      const existing = new Set(rows.map((r) => String(r._id)));
      const missing = communityIds.filter((id) => !existing.has(id));
      if (missing.length) {
        return res.status(400).json({
          ok: false,
          counts,
          warnings,
          errors: [{
            code: "PUBLIC_COMMUNITY_NOT_FOUND",
            message: "One or more publicCommunityId values were not found",
            publicCommunityIds: missing,
          }],
        });
      }
    }

    if (builderProfile) {
      await BuilderProfile.findOneAndUpdate(
        { companyId: builderProfile.companyId },
        { $set: { ...builderProfile.patch }, $setOnInsert: { companyId: builderProfile.companyId } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      counts.builderProfileUpserted = 1;
    }

    const publishedAt = requestedAt || new Date();
    for (const entry of builderInCommunities) {
      const communityPatch = derivePublicCommunityPatchFromBuilderInCommunity({
        ...entry.patch,
        communityPatch: entry.communityPatch,
      });
      if (communityPatch) {
        const resolvedCommunity = await resolveOrCreatePublicCommunity(
          db,
          {
            publicCommunityId: entry.publicCommunityId,
            ...communityPatch,
          },
          { allowCreate: false },
        );
        if (!resolvedCommunity) {
          return res.status(500).json({
            ok: false,
            counts,
            warnings,
            errors: [{ code: "INTERNAL_ERROR", message: "Failed to update PublicCommunity from builderInCommunity" }],
          });
        }
      }
      const entrySet = buildSetDoc(entry.patch);
      entrySet.source = "keepup";
      entrySet.lastPublishedAt = publishedAt;
      await BuilderInCommunity.findOneAndUpdate(
        { companyId: entry.companyId, publicCommunityId: entry.publicCommunityId },
        {
          $set: entrySet,
          $setOnInsert: { companyId: entry.companyId, publicCommunityId: entry.publicCommunityId },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      counts.builderInCommunityUpserted += 1;
    }

    const dedupCatalog = new Map();
    planCatalog.forEach((entry) => dedupCatalog.set(planCatalogKey(entry.companyIdString, entry.keepupFloorPlanId), entry));
    const existingCatalog = dedupCatalog.size
      ? await PlanCatalog.find({
        $or: Array.from(dedupCatalog.values()).map((e) => ({ companyId: e.companyId, keepupFloorPlanId: e.keepupFloorPlanId })),
      }).lean()
      : [];
    const existingCatalogByKey = new Map(existingCatalog.map((doc) => [
      planCatalogKey(String(doc.companyId), String(doc.keepupFloorPlanId)),
      doc,
    ]));

    const catalogIdByKey = new Map();
    const catalogInsertErrors = [];
    for (const [key, entry] of dedupCatalog.entries()) {
      const existing = existingCatalogByKey.get(key);
      if (existing && existing.source && existing.source !== "keepup") {
        warnings.push(`PlanCatalog ${entry.keepupFloorPlanId} for company ${entry.companyIdString} exists with source=${existing.source}; skipped`);
        continue;
      }
      const setDoc = buildSetDoc(entry.patch);
      if (!hasOwn(entry.patch, "slug")) {
        const nameForSlug = (hasOwn(entry.patch, "name") && entry.patch.name) || existing?.name || "";
        const slug = normalizePublicSlug(nameForSlug);
        if (slug) setDoc.slug = slug;
      }
      if (!hasOwn(entry.patch, "name") && !existing?.name) {
        catalogInsertErrors.push(`planCatalog entry ${entry.keepupFloorPlanId} for company ${entry.companyIdString} requires name for new insert`);
        continue;
      }
      setDoc.source = "keepup";
      setDoc.lastPublishedAt = publishedAt;
      const upserted = await PlanCatalog.findOneAndUpdate(
        { companyId: entry.companyId, keepupFloorPlanId: entry.keepupFloorPlanId },
        {
          $set: setDoc,
          $setOnInsert: { companyId: entry.companyId, keepupFloorPlanId: entry.keepupFloorPlanId },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      catalogIdByKey.set(key, String(upserted._id));
      counts.planCatalogUpserted += 1;
    }
    if (catalogInsertErrors.length) {
      return res.status(400).json({
        ok: false,
        counts,
        warnings,
        errors: catalogInsertErrors.map((message) => ({ code: "VALIDATION_ERROR", message })),
      });
    }

    const planKeysNeeded = new Set(planOfferings.map((entry) => planCatalogKey(entry.companyIdString, entry.keepupFloorPlanId)));
    const unresolvedKeys = Array.from(planKeysNeeded).filter((key) => !catalogIdByKey.has(key));
    if (unresolvedKeys.length) {
      const rows = await PlanCatalog.find({
        $or: unresolvedKeys.map((key) => {
          const [companyIdString, keepupFloorPlanId] = key.split("::");
          return { companyId: new mongoose.Types.ObjectId(companyIdString), keepupFloorPlanId };
        }),
      }).lean();
      rows.forEach((doc) => {
        const key = planCatalogKey(String(doc.companyId), String(doc.keepupFloorPlanId));
        if (doc.source && doc.source !== "keepup") {
          warnings.push(`PlanCatalog ${doc.keepupFloorPlanId} for company ${String(doc.companyId)} has source=${doc.source}; KeepUp reference rejected`);
          return;
        }
        catalogIdByKey.set(key, String(doc._id));
      });
    }
    const missingPlanRefs = Array.from(planKeysNeeded)
      .filter((key) => !catalogIdByKey.has(key))
      .map((key) => {
        const [companyId, keepupFloorPlanId] = key.split("::");
        return { companyId, keepupFloorPlanId };
      });
    if (missingPlanRefs.length) {
      return res.status(400).json({
        ok: false,
        counts,
        warnings,
        errors: [{
          code: "PLAN_CATALOG_NOT_FOUND",
          message: "One or more planOfferings references could not resolve planCatalog records",
          missingPlanCatalogRefs: missingPlanRefs,
        }],
      });
    }

    const dedupOfferings = new Map();
    planOfferings.forEach((entry) => {
      const catalogIdString = catalogIdByKey.get(planCatalogKey(entry.companyIdString, entry.keepupFloorPlanId));
      if (!catalogIdString) return;
      const dedupKey = `${entry.companyIdString}::${entry.publicCommunityIdString}::${catalogIdString}`;
      if (shouldDebugPlanCatalog(catalogIdString)) {
        console.info(
          "[internal publish keepup bundle][planOfferings:inbound]",
          JSON.stringify({
            planCatalogId: catalogIdString,
            companyId: entry.companyIdString,
            publicCommunityId: entry.publicCommunityIdString,
            keepupFloorPlanId: entry.keepupFloorPlanId,
            basePriceFrom: hasOwn(entry.patch, "basePriceFrom") ? entry.patch.basePriceFrom : undefined,
            basePriceAsOf: hasOwn(entry.patch, "basePriceAsOf") ? entry.patch.basePriceAsOf : undefined,
          }),
        );
      }
      const existingRow = dedupOfferings.get(dedupKey);
      if (!existingRow) {
        dedupOfferings.set(dedupKey, { entry, catalogIdString });
        return;
      }
      dedupOfferings.set(dedupKey, {
        entry: {
          ...existingRow.entry,
          patch: mergePlanOfferingPatches(existingRow.entry.patch, entry.patch),
        },
        catalogIdString,
      });
    });

    for (const [, row] of dedupOfferings.entries()) {
      const { entry, catalogIdString } = row;
      const planCatalogId = new mongoose.Types.ObjectId(catalogIdString);
      const filter = { companyId: entry.companyId, publicCommunityId: entry.publicCommunityId, planCatalogId };
      const existing = await CommunityPlanOffering.findOne(filter).select({ source: 1, basePriceFrom: 1 }).lean();
      if (existing && existing.source && existing.source !== "keepup") {
        warnings.push(`CommunityPlanOffering for company ${entry.companyIdString}, community ${entry.publicCommunityIdString}, plan ${entry.keepupFloorPlanId} exists with source=${existing.source}; skipped`);
        continue;
      }
      const setDoc = buildSetDoc(entry.patch);
      setDoc.keepupFloorPlanId = entry.keepupFloorPlanId;
      setDoc.source = "keepup";
      setDoc.lastPublishedAt = publishedAt;
      const incomingHasBasePriceFrom = hasOwn(entry.patch, "basePriceFrom");
      const incomingBasePriceFrom = incomingHasBasePriceFrom ? entry.patch.basePriceFrom : undefined;
      const preserveExistingNumericBasePrice =
        incomingHasBasePriceFrom &&
        incomingBasePriceFrom === null &&
        isFiniteNumber(existing?.basePriceFrom);
      if (preserveExistingNumericBasePrice) {
        delete setDoc.basePriceFrom;
        if (hasOwn(setDoc, "basePriceAsOf")) {
          delete setDoc.basePriceAsOf;
        }
      }
      if (
        hasOwn(entry.patch, "basePriceFrom") &&
        !hasOwn(entry.patch, "basePriceAsOf") &&
        typeof setDoc.basePriceFrom === "number" &&
        (existing?.basePriceFrom === undefined || existing?.basePriceFrom === null || Number(existing.basePriceFrom) !== Number(setDoc.basePriceFrom))
      ) {
        setDoc.basePriceAsOf = publishedAt;
      }
      if (shouldDebugPlanCatalog(catalogIdString)) {
        console.info(
          "[internal publish keepup bundle][planOfferings:upsert]",
          JSON.stringify({
            filter: {
              companyId: entry.companyIdString,
              publicCommunityId: entry.publicCommunityIdString,
              planCatalogId: catalogIdString,
            },
            keepupFloorPlanId: entry.keepupFloorPlanId,
            incomingBasePriceFrom,
            incomingBasePriceAsOf: hasOwn(entry.patch, "basePriceAsOf") ? entry.patch.basePriceAsOf : undefined,
            existingBasePriceFrom: existing?.basePriceFrom ?? null,
            preserveExistingNumericBasePrice,
            setBasePriceFrom: hasOwn(setDoc, "basePriceFrom") ? setDoc.basePriceFrom : undefined,
            setBasePriceAsOf: hasOwn(setDoc, "basePriceAsOf") ? setDoc.basePriceAsOf : undefined,
          }),
        );
      }
      const updatedOffering = await CommunityPlanOffering.findOneAndUpdate(
        filter,
        {
          $set: setDoc,
          $setOnInsert: { companyId: entry.companyId, publicCommunityId: entry.publicCommunityId, planCatalogId },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      if (shouldDebugPlanCatalog(catalogIdString)) {
        console.info(
          "[internal publish keepup bundle][planOfferings:stored]",
          JSON.stringify({
            planCatalogId: catalogIdString,
            companyId: entry.companyIdString,
            publicCommunityId: entry.publicCommunityIdString,
            storedBasePriceFrom: updatedOffering?.basePriceFrom ?? null,
            storedBasePriceAsOf: updatedOffering?.basePriceAsOf ?? null,
            lastPublishedAt: updatedOffering?.lastPublishedAt ?? null,
          }),
        );
      }
      counts.planOfferingsUpserted += 1;
    }

    const dedupHomes = new Map();
    publicHomes.forEach((entry) => {
      dedupHomes.set(publicHomeStableKey(entry.stableId), entry);
    });

    const homePlanKeysNeeded = new Set();
    Array.from(dedupHomes.values()).forEach((entry) => {
      if (!entry.keepupFloorPlanId) return;
      homePlanKeysNeeded.add(planCatalogKey(entry.companyIdString, entry.keepupFloorPlanId));
    });

    const unresolvedHomePlanKeys = Array.from(homePlanKeysNeeded).filter((key) => !catalogIdByKey.has(key));
    if (unresolvedHomePlanKeys.length) {
      const rows = await PlanCatalog.find({
        $or: unresolvedHomePlanKeys.map((key) => {
          const [companyIdString, keepupFloorPlanId] = key.split("::");
          return { companyId: new mongoose.Types.ObjectId(companyIdString), keepupFloorPlanId };
        }),
      }).lean();
      rows.forEach((doc) => {
        const key = planCatalogKey(String(doc.companyId), String(doc.keepupFloorPlanId));
        catalogIdByKey.set(key, String(doc._id));
      });
    }

      const homeEntries = Array.from(dedupHomes.values());
      const existingHomes = homeEntries.length
        ? await PublicHome.find({
          $or: [
            { stableId: { $in: homeEntries.map((entry) => entry.stableId) } },
            ...homeEntries.map((entry) => ({ companyId: entry.companyId, sourceHomeId: entry.sourceHomeId })),
          ],
        }).select({
          _id: 1,
          companyId: 1,
          stableId: 1,
          source: 1,
          sourceHomeId: 1,
          keepupListingId: 1,
          keepupLotId: 1,
          address: 1,
          address1: 1,
          addressLine1: 1,
          city: 1,
          state: 1,
          postalCode: 1,
          formattedAddress: 1,
        }).lean()
        : [];
      const existingHomesByStableId = new Map();
      const existingHomesByKey = new Map();
      existingHomes.forEach((homeDoc) => {
        const stableKey = publicHomeStableKey(homeDoc.stableId);
        if (stableKey && !existingHomesByStableId.has(stableKey)) {
          existingHomesByStableId.set(stableKey, homeDoc);
        }
        const key = publicHomeKey(String(homeDoc.companyId), String(homeDoc.sourceHomeId || ""));
        if (!existingHomesByKey.has(key)) existingHomesByKey.set(key, []);
        existingHomesByKey.get(key).push(homeDoc);
    });

    const missingHomePlanRefsMap = new Map();
    const homeBulkOps = [];
    const deactivationScopes = new Map();

      for (const entry of homeEntries) {
        const key = publicHomeKey(entry.companyIdString, entry.sourceHomeId);
        const scopeKeepupCommunityId = normalizeKeepupCommunityScopeValue(entry.patch?.keepupCommunityId);
        const existingByStableId = existingHomesByStableId.get(publicHomeStableKey(entry.stableId)) || null;
        if (existingByStableId && String(existingByStableId.companyId) !== entry.companyIdString) {
          warnings.push({
            code: "SKIPPED_STABLE_ID_COLLISION",
            message: "Skipped home upsert because stableId is already owned by another company",
            stableId: entry.stableId,
            companyId: entry.companyIdString,
            existingCompanyId: String(existingByStableId.companyId),
          });
          continue;
        }
        const existingForKey = existingHomesByKey.get(key) || [];
        const matchedExistingDoc = existingByStableId || existingForKey.find((doc) => isKeepupOwnedPublicHomeDoc(doc)) || existingForKey[0] || null;
        const matchedSourceType = getPublicHomeSourceType(matchedExistingDoc?.source);
        if (
          matchedExistingDoc &&
          !matchedSourceType &&
          !isKeepupOwnedPublicHomeDoc(matchedExistingDoc)
        ) {
          warnings.push({
            code: "SKIPPED_UNKNOWN_OWNERSHIP_HOME",
            message: "Skipped home upsert because existing record ownership could not be inferred",
            companyId: entry.companyIdString,
            stableId: entry.stableId,
            sourceHomeId: entry.sourceHomeId,
          });
          continue;
        }
        const nonKeepupDoc =
          matchedExistingDoc && matchedSourceType && matchedSourceType !== KEEPUP_SOURCE_TYPE
            ? matchedExistingDoc
            : (!existingByStableId
              ? existingForKey.find((doc) => {
                const sourceType = getPublicHomeSourceType(doc.source);
                return sourceType && sourceType !== KEEPUP_SOURCE_TYPE;
              }) || null
              : null);
        if (nonKeepupDoc) {
          warnings.push({
            code: "SKIPPED_NON_KEEPUP_HOME",
            message: "Skipped home upsert because existing record is not keepup-owned",
            companyId: entry.companyIdString,
            stableId: entry.stableId,
            sourceHomeId: entry.sourceHomeId,
            existingSource: getPublicHomeSourceType(nonKeepupDoc.source) || "unknown",
          });
          continue;
        }

      const scopeKey = publicHomeScopeKey(
        entry.companyIdString,
        entry.publicCommunityIdString,
        scopeKeepupCommunityId,
      );
      if (!deactivationScopes.has(scopeKey)) {
          deactivationScopes.set(scopeKey, {
            companyId: entry.companyId,
            publicCommunityId: entry.publicCommunityId,
            keepupCommunityId: scopeKeepupCommunityId || null,
            stableIds: new Set(),
            sourceHomeIds: new Set(),
          });
        }
        deactivationScopes.get(scopeKey).stableIds.add(entry.stableId);
        deactivationScopes.get(scopeKey).sourceHomeIds.add(entry.sourceHomeId);

      const planKey = entry.keepupFloorPlanId
        ? planCatalogKey(entry.companyIdString, entry.keepupFloorPlanId)
        : null;
      const planCatalogIdString = planKey ? catalogIdByKey.get(planKey) : null;
      let resolvedPlanCatalogId = null;
      if (planCatalogIdString) {
        resolvedPlanCatalogId = new mongoose.Types.ObjectId(planCatalogIdString);
      } else if (entry.keepupFloorPlanId) {
        const missingKey = `${entry.companyIdString}::${entry.keepupFloorPlanId}`;
        missingHomePlanRefsMap.set(missingKey, {
          companyId: entry.companyIdString,
          keepupFloorPlanId: entry.keepupFloorPlanId,
          sourceHomeId: entry.sourceHomeId,
        });
      }

        const setDoc = buildPublicHomeSetDoc(entry, resolvedPlanCatalogId, publishedAt, matchedExistingDoc);
        const setOnInsertDoc = {
          companyId: entry.companyId,
        };
        if (!matchedExistingDoc) {
          delete setDoc.stableId;
          setOnInsertDoc.stableId = entry.stableId;
        }

        logKeepupBundleDebug("[internal publish keepup bundle][publicHomes:upsertCandidate]", {
          companyId: entry.companyIdString,
          publicCommunityId: entry.publicCommunityIdString,
          keepupCommunityId: scopeKeepupCommunityId || null,
          stableId: entry.stableId,
          sourceHomeId: entry.sourceHomeId,
          keepupListingId: entry.keepupListingId || null,
          keepupLotId: entry.keepupLotId || null,
          keepupFloorPlanId: entry.keepupFloorPlanId || null,
          matchedExistingId: matchedExistingDoc ? String(matchedExistingDoc._id) : null,
          matchedBy: existingByStableId
            ? "stableId"
            : matchedExistingDoc
              ? "companyId+sourceHomeId"
              : "insert",
          matchedExistingStableId: matchedExistingDoc?.stableId || null,
          matchedExistingSourceHomeId: matchedExistingDoc?.sourceHomeId || null,
        });

        homeBulkOps.push({
          updateOne: {
            filter: matchedExistingDoc ? { _id: matchedExistingDoc._id } : { stableId: entry.stableId },
            update: {
              $set: setDoc,
              $setOnInsert: setOnInsertDoc,
            },
            upsert: true,
          },
        });
    }

    if (homeBulkOps.length) {
      await PublicHome.bulkWrite(homeBulkOps, { ordered: false });
      counts.publicHomesUpserted += homeBulkOps.length;
      logKeepupBundleDebug("[internal publish keepup bundle][publicHomes:bulkWrite]", {
        operations: homeBulkOps.length,
      });
    }

    if (missingHomePlanRefsMap.size) {
      warnings.push({
        code: "PLAN_CATALOG_LINK_MISSING",
        message: "One or more publicHomes could not resolve keepupFloorPlanId to planCatalogId",
        missingPlanCatalogRefs: Array.from(missingHomePlanRefsMap.values()),
      });
    }

    if (unpublishMissingHomes && deactivationScopes.size) {
      for (const [, scope] of deactivationScopes.entries()) {
        const deactivationQuery = {
          companyId: scope.companyId,
          publicCommunityId: scope.publicCommunityId,
          $and: [
            keepupOwnedPublicHomeFilter(),
            buildKeepupCommunityScopeFilter(scope.keepupCommunityId),
            { stableId: { $nin: Array.from(scope.stableIds) } },
            { sourceHomeId: { $nin: Array.from(scope.sourceHomeIds) } },
            { isActive: { $ne: false } },
          ],
        };
        if (keepupBundleDebugEnabled()) {
          const docsToDeactivate = await PublicHome.collection.find(
            deactivationQuery,
            {
              projection: {
                _id: 1,
                stableId: 1,
                sourceHomeId: 1,
                keepupCommunityId: 1,
                keepupFloorPlanId: 1,
                keepupListingId: 1,
                keepupLotId: 1,
                address1: 1,
                formattedAddress: 1,
                isActive: 1,
              },
            },
          ).toArray();
          logKeepupBundleDebug("[internal publish keepup bundle][publicHomes:deactivate:selection]", {
            companyId: String(scope.companyId),
            publicCommunityId: String(scope.publicCommunityId),
            keepupCommunityId: scope.keepupCommunityId || null,
            scopeType: scope.keepupCommunityId ? "keepupCommunityId" : "missing_keepupCommunityId_only",
            incomingStableIds: Array.from(scope.stableIds),
            incomingSourceHomeIds: Array.from(scope.sourceHomeIds),
            selectedCount: docsToDeactivate.length,
            selectedHomes: docsToDeactivate.map((doc) => ({
              id: String(doc._id),
              stableId: doc.stableId || null,
              sourceHomeId: doc.sourceHomeId || null,
              keepupCommunityId: doc.keepupCommunityId || null,
              keepupFloorPlanId: doc.keepupFloorPlanId || null,
              keepupListingId: doc.keepupListingId || null,
              keepupLotId: doc.keepupLotId || null,
              address1: doc.address1 || null,
              formattedAddress: doc.formattedAddress || null,
              isActive: doc.isActive !== false,
            })),
          });
        }
        const result = await PublicHome.collection.updateMany(
          deactivationQuery,
          {
            $set: {
              isActive: false,
              published: false,
              lastPublishedAt: publishedAt,
            },
          },
        );
        counts.publicHomesDeactivated += result.modifiedCount || 0;
      }
    }

    const durationMs = Date.now() - startedAt;
    const logCompanyId =
      builderProfile?.companyIdString ||
      keepupCompanyId ||
      builderInCommunities[0]?.companyIdString ||
      planCatalog[0]?.companyIdString ||
      planOfferings[0]?.companyIdString ||
      publicHomes[0]?.companyIdString ||
      "unknown";
    console.info(
      "[internal publish keepup bundle]",
      JSON.stringify({
        companyId: logCompanyId,
        publicCommunities: counts.publicCommunitiesUpserted,
        communities: builderInCommunities.length,
        planCatalog: counts.planCatalogUpserted,
        planOfferings: counts.planOfferingsUpserted,
        publicHomes: counts.publicHomesUpserted,
        publicHomesDeactivated: counts.publicHomesDeactivated,
        durationMs,
        status: "ok",
      }),
    );

    return res.json({ ok: true, counts, warnings, errors: [] });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[internal publish keepup bundle] failed",
      JSON.stringify({ durationMs, status: "error", message }),
    );
    return res.status(500).json({
      ok: false,
      counts,
      warnings,
      errors: [{ code: "INTERNAL_ERROR", message: "Failed to process publish bundle" }],
    });
  }
});

router.get("/debug/builder/:companyId", requireInternalApiKeyOrNonProd, async (req, res) => {
  try {
    const companyId = parseObjectId(req.params.companyId);
    if (!companyId) {
      return res.status(400).json({ ok: false, error: "BAD_REQUEST", message: "Invalid companyId" });
    }
    const [builderProfile, builderInCommunities, planCatalog, planOfferings, publicHomes] = await Promise.all([
      BuilderProfile.findOne({ companyId }).lean(),
      BuilderInCommunity.find({ companyId }).lean(),
      PlanCatalog.find({ companyId }).lean(),
      CommunityPlanOffering.find({ companyId }).lean(),
      PublicHome.find({ companyId }).lean(),
    ]);
    return res.json({
      ok: true,
      builderProfile: builderProfile || null,
      builderInCommunities: builderInCommunities || [],
      planCatalog: planCatalog || [],
      planOfferings: planOfferings || [],
      publicHomes: publicHomes || [],
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

module.exports = router;
