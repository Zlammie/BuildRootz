const { ObjectId } = require("mongodb");
const {
  normalizeCommunityAmenitiesForRender,
  normalizeCommunityProductTypesForRender,
} = require("../../shared/publicCommunityView");
const {
  normalizePromo,
} = require("../../shared/promo");

const BUILDER_IN_COMMUNITY_COLLECTION_CANDIDATES = [
  "BuilderInCommunity",
  "BuilderInCommunities",
  "builderincommunity",
  "builderincommunities",
];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isDefined(value) {
  return value !== undefined;
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function mergeDefined(primary, fallback) {
  const base = asObject(fallback);
  const next = asObject(primary);
  const out = { ...base };
  Object.keys(next).forEach((key) => {
    if (isDefined(next[key])) {
      out[key] = next[key];
    }
  });
  return out;
}

function pickDefined(primary, fallback) {
  return isDefined(primary) ? primary : fallback;
}

function mapModelsSummaryToAddresses(modelsSummary = []) {
  if (!Array.isArray(modelsSummary)) return [];
  return modelsSummary
    .map((row) => {
      const item = asObject(row);
      const address = typeof item.address === "string" ? item.address.trim() : "";
      if (!address) return null;
      return {
        street: address,
        label:
          (typeof item.floorPlanName === "string" && item.floorPlanName.trim()) ||
          (typeof item.listingId === "string" && item.listingId.trim()) ||
          null,
      };
    })
    .filter(Boolean);
}

function normalizeVisibility(value, fallback = "hidden") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "public" || normalized === "gated" || normalized === "hidden") {
    return normalized;
  }
  return fallback;
}

function mergeCommunityBuilderView({ legacy, bic }) {
  const legacyView = asObject(legacy);
  if (!bic || typeof bic !== "object") {
    return { ...legacyView };
  }

  const bicView = asObject(bic);
  const webData = asObject(bicView.webData);
  const presentation = asObject(bicView.presentation);
  const legacyDetails = asObject(legacyView.communityDetails);
  const legacyContact = asObject(legacyDetails.primaryContact);
  const legacySchools = asObject(legacyDetails.schools);
  const legacyPidMud = asObject(legacyDetails.pidMud);
  const legacyRealtor = asObject(legacyDetails.realtorIncentives);

  const contactVisibility = asObject(webData.contactVisibility);
  const showName = contactVisibility.showName !== false;
  const showPhone = contactVisibility.showPhone !== false;
  const showEmail = contactVisibility.showEmail === true;

  const mergedPrimaryContact = mergeDefined(webData.primaryContact, legacyContact);
  const primaryContact = {
    ...mergedPrimaryContact,
    name: showName ? mergedPrimaryContact.name : null,
    phone: showPhone ? mergedPrimaryContact.phone : null,
    email: showEmail ? mergedPrimaryContact.email : null,
  };

  const mergedSchools = mergeDefined(webData.schools, legacySchools);
  const mergedHoa = mergeDefined(webData.hoa, {
    amount: legacyDetails.hoaAmount,
    cadence: legacyDetails.hoaFrequency,
  });
  const mergedPidMud = mergeDefined(
    {
      hasPid: pickDefined(webData.hasPID, undefined),
      hasMud: pickDefined(webData.hasMUD, undefined),
    },
    legacyPidMud,
  );

  const earnestVisibility = normalizeVisibility(asObject(webData.earnestMoney).visibility, "hidden");
  const earnestMoney =
    earnestVisibility === "public"
      ? pickDefined(asObject(webData.earnestMoney).amount, legacyDetails.earnestMoney)
      : null;

  const realtorVisibility = normalizeVisibility(
    asObject(webData.realtorCommission).visibility,
    "hidden",
  );
  const realtorAmount =
    realtorVisibility === "public"
      ? pickDefined(asObject(webData.realtorCommission).amount, legacyRealtor.amount)
      : null;

  const communityDetails = {
    ...legacyDetails,
    primaryContact,
    totalLots: pickDefined(webData.totalLots, legacyDetails.totalLots),
    schools: mergedSchools,
    hoaAmount: pickDefined(mergedHoa.amount, legacyDetails.hoaAmount),
    hoaFrequency: pickDefined(mergedHoa.cadence, legacyDetails.hoaFrequency),
    earnestMoney,
    realtorIncentives: {
      ...legacyRealtor,
      enabled: realtorVisibility === "public",
      amount: realtorAmount,
      notes: realtorVisibility === "public" ? pickDefined(legacyRealtor.notes, null) : null,
    },
    pidMud: mergedPidMud,
  };

  const modelAddressesFromBic = mapModelsSummaryToAddresses(bicView.modelsSummary);
  const modelAddressFromBic = modelAddressesFromBic[0] || null;
  const rawAmenities =
    Array.isArray(webData.amenities)
      ? webData.amenities
      : Array.isArray(webData.ammenities)
        ? webData.ammenities
        : Array.isArray(legacyView.amenities)
          ? legacyView.amenities
          : [];
  const amenities = normalizeCommunityAmenitiesForRender(rawAmenities)
    .map((item) => item.label)
    .filter(Boolean);
  const rawProductTypes =
    Array.isArray(webData.productTypes)
      ? webData.productTypes
      : Array.isArray(legacyView.productTypes)
        ? legacyView.productTypes
        : [];
  const productTypes = normalizeCommunityProductTypesForRender(rawProductTypes)
    .map((item) => item.label)
    .filter(Boolean);
  const promo = normalizePromo(
    hasValue(webData.promo) ? webData.promo : legacyView.promo,
  );

  return {
    ...legacyView,
    communityDetails,
    description: hasValue(presentation.description)
      ? presentation.description
      : legacyView.description,
    promotion: hasValue(presentation.promotion) ? presentation.promotion : legacyView.promotion,
    ...(promo?.headline ? { promotion: promo.headline } : {}),
    ...(promo ? { promo } : {}),
    heroImageUrl: hasValue(presentation.heroImageUrl)
      ? presentation.heroImageUrl
      : legacyView.heroImageUrl,
    modelAddresses: modelAddressesFromBic.length
      ? modelAddressesFromBic
      : Array.isArray(legacyView.modelAddresses)
        ? legacyView.modelAddresses
        : [],
    modelAddress: modelAddressFromBic || legacyView.modelAddress || null,
    ...(amenities.length ? { amenities } : {}),
    ...(productTypes.length ? { productTypes } : {}),
  };
}

function toObjectId(value) {
  if (value instanceof ObjectId) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ObjectId.isValid(trimmed)) return null;
  return new ObjectId(trimmed);
}

async function resolveCollectionFromDb(db) {
  if (!db) return null;
  const names = (await db.listCollections().toArray()).map((col) => col.name);
  const foundName = BUILDER_IN_COMMUNITY_COLLECTION_CANDIDATES.find((name) => names.includes(name));
  if (!foundName) return null;
  return db.collection(foundName);
}

async function resolveBuilderInCommunity({ companyId, publicCommunityId, collection, db }) {
  const companyOid = toObjectId(companyId);
  const communityOid = toObjectId(publicCommunityId);
  if (!companyOid || !communityOid) return null;

  const resolvedCollection = collection || (await resolveCollectionFromDb(db));
  if (!resolvedCollection) return null;

  return resolvedCollection
    .findOne({
      companyId: { $in: [companyOid, companyOid.toHexString()] },
      publicCommunityId: { $in: [communityOid, communityOid.toHexString()] },
    })
    .catch(() => null);
}

module.exports = {
  resolveBuilderInCommunity,
  mergeCommunityBuilderView,
  BUILDER_IN_COMMUNITY_COLLECTION_CANDIDATES,
};
