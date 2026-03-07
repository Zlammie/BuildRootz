const path = require("path");
const { hasCommunityDetailsInput, normalizeCommunityDetails } = require("./communityDetails");
const {
  cleanString,
  normalizeHighlights,
  normalizeStringList,
  absolutizeAssetUrl,
} = require("./communityContent");
const {
  normalizeCommunityAmenitiesForRender,
  normalizeCommunityProductTypesForRender,
} = require("./publicCommunityView");
const {
  normalizePromo,
} = require("./promo");
const {
  normalizePublicSlug,
} = require("./publicSlug");

let ObjectId;
(() => {
  const searchRoots = [
    __dirname,
    path.join(__dirname, ".."),
    path.join(__dirname, "..", "backend"),
    path.join(__dirname, "..", "frontend"),
  ];
  let req = null;
  try {
    // Avoid bundler resolution; load mongodb only at runtime.
    // eslint-disable-next-line no-eval
    req = eval("require");
  } catch {
    req = null;
  }
  if (!req) {
    ObjectId = null;
    return;
  }
  for (const root of searchRoots) {
    try {
      const resolved = req.resolve("mongodb", { paths: [root] });
      ({ ObjectId } = req(resolved));
      return;
    } catch {
      // keep searching
    }
  }
  try {
    ({ ObjectId } = req("mongodb"));
    return;
  } catch {
    ObjectId = null;
  }
})();

const COMMUNITY_COLLECTION_CANDIDATES = [
  "PublicCommunity",
  "PublicCommunities",
  "Community",
  "Communities",
  "publiccommunities",
  "publiccommunity",
  "community",
  "communities",
];

function normalizeStr(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function roundCoord(value) {
  const num = Number(value);
  if (Number.isFinite(num)) {
    return Number(num.toFixed(4));
  }
  return null;
}

function computeCanonicalKey({ name, city, state, lat, lng, location }) {
  const normName = normalizeStr(name);
  const normCity = normalizeStr(city);
  const normState = normalizeStr(state);
  const loc = location && typeof location === "object" ? location : {};
  const latVal = roundCoord(lat ?? loc.lat);
  const lngVal = roundCoord(lng ?? loc.lng);
  const parts = [normName, normCity, normState];
  if (latVal !== null && lngVal !== null) {
    parts.push(`${latVal},${lngVal}`);
  }
  const key = parts.filter(Boolean).join("::");
  return key || null;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function hasOwnDefined(obj, key) {
  return Boolean(obj) && hasOwn(obj, key);
}

function parseCommunityObjectId(value) {
  if (!ObjectId || !value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value.trim())) {
    return new ObjectId(value.trim());
  }
  return null;
}

async function ensureCommunityIndexes(col) {
  try {
    await col.createIndexes([
      { key: { slug: 1 }, name: "slug_unique", unique: true, sparse: true },
      {
        key: { keepupCommunityId: 1 },
        name: "keepupCommunityId_unique",
        unique: true,
        partialFilterExpression: { keepupCommunityId: { $exists: true, $type: "string", $ne: "" } },
      },
      {
        key: { canonicalKey: 1 },
        name: "canonicalKey_unique",
        unique: true,
        partialFilterExpression: { canonicalKey: { $exists: true, $type: "string", $ne: "" } },
      },
    ]);
  } catch {
    // best effort
  }
}

async function getCommunityCollection(db) {
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  const found =
    COMMUNITY_COLLECTION_CANDIDATES.find((name) => names.includes(name)) ||
    COMMUNITY_COLLECTION_CANDIDATES[0];
  return db.collection(found);
}

/**
 * Resolve a community identifier (slug, _id string, keepupCommunityId) to the public community doc.
 * Returns a simplified object or null if not found.
 */
async function resolvePublicCommunity(db, identifier) {
  if (!identifier) return null;
  const col = await getCommunityCollection(db);
  await ensureCommunityIndexes(col);
  const slugValue = identifier.toString();
  const or = [];
  const isOid = typeof identifier === "string" && /^[a-fA-F0-9]{24}$/.test(identifier);
  if (isOid && ObjectId) {
    const oid = new ObjectId(identifier);
    or.push({ _id: oid }, { keepupCommunityId: oid.toString() });
  }
  const slugRegex = new RegExp(`^${slugValue}$`, "i");
  or.push(
    { keepupCommunityId: identifier },
    { slug: identifier },
    { slug: slugValue.toLowerCase() },
    { slug: slugRegex },
  );

  const doc = await col.findOne({ $or: or }).catch(() => null);
  if (!doc) return null;
  const keepupCommunityId =
    doc.keepupCommunityId ?? doc.communityId ? String(doc.keepupCommunityId ?? doc.communityId) : undefined;
  const canonicalKey =
    (typeof doc.canonicalKey === "string" && doc.canonicalKey) ||
    computeCanonicalKey(doc) ||
    null;
  if (canonicalKey && !doc.canonicalKey) {
    col.updateOne({ _id: doc._id }, { $set: { canonicalKey } }).catch(() => {});
  }
  return {
    _id: doc._id.toString(),
    keepupCommunityId,
    canonicalKey: canonicalKey || undefined,
    slug: doc.slug,
  };
}

async function resolveCanonicalCommunityById(db, id) {
  if (!id || !ObjectId || !ObjectId.isValid(id)) return null;
  const col = await getCommunityCollection(db);
  const doc = await col.findOne({ _id: new ObjectId(id) }).catch(() => null);
  if (!doc) return null;
  return {
    _id: doc._id.toString(),
    keepupCommunityId:
      doc.keepupCommunityId ?? doc.communityId ? String(doc.keepupCommunityId ?? doc.communityId) : undefined,
    canonicalKey: doc.canonicalKey,
    slug: doc.slug,
  };
}

async function resolveOrCreatePublicCommunity(db, input = {}, options = {}) {
  const allowCreate = typeof options.allowCreate === "boolean" ? options.allowCreate : true;
  const col = await getCommunityCollection(db);
  await ensureCommunityIndexes(col);

  const publicCommunityId = parseCommunityObjectId(input.publicCommunityId || input._id);
  const keepupCommunityId = input.keepupCommunityId ? String(input.keepupCommunityId).trim() : null;
  const slug = input.slug ? normalizePublicSlug(input.slug) : null;
  const canonicalKey =
    (typeof input.canonicalKey === "string" && input.canonicalKey) ||
    computeCanonicalKey(input);

  const filter = publicCommunityId
    ? { _id: publicCommunityId }
    : keepupCommunityId
      ? { keepupCommunityId }
      : canonicalKey
        ? { canonicalKey }
        : slug
          ? { slug }
          : null;
  if (!filter) return null;

  const $setOnInsert = {
    createdAt: new Date(),
  };
  const $set = {
    updatedAt: new Date(),
    ...(slug ? { slug } : {}),
    ...(keepupCommunityId ? { keepupCommunityId } : {}),
    ...(canonicalKey ? { canonicalKey } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.city ? { city: input.city } : {}),
    ...(input.state ? { state: input.state } : {}),
    ...(input.location ? { location: input.location } : {}),
  };
  const fees = asObject(input.fees);
  if (hasCommunityDetailsInput(input)) {
    $set.communityDetails = normalizeCommunityDetails(input);
  }
  if (hasOwn(input, "overview")) {
    $set.overview = cleanString(input.overview);
  }
  if (hasOwn(input, "highlights")) {
    $set.highlights = normalizeHighlights(input.highlights, { maxItems: 6 });
  }
  if (hasOwn(input, "heroImageUrl")) {
    const heroImageUrl = absolutizeAssetUrl(input.heroImageUrl);
    $set.heroImageUrl = heroImageUrl;
    $set.mapImage = heroImageUrl;
  }
  if (hasOwn(input, "imageUrls")) {
    const imageUrls = normalizeStringList(
      (Array.isArray(input.imageUrls) ? input.imageUrls : []).map((url) => absolutizeAssetUrl(url)),
      { maxItems: 20 },
    );
    $set.imageUrls = imageUrls;
    $set.images = imageUrls;
  }
  if (hasOwn(input, "amenities")) {
    $set.amenities = normalizeCommunityAmenitiesForRender(input.amenities);
  }
  if (hasOwn(input, "productTypes")) {
    $set.productTypes = normalizeCommunityProductTypesForRender(input.productTypes);
  }
  if (hasOwn(input, "promo")) {
    $set.promo = normalizePromo(input.promo);
  }
  if (hasOwn(input, "fees")) {
    if (input.fees === null) {
      $set.fees = null;
    } else if (fees) {
      if (hasOwn(fees, "hoaMonthly")) $set["fees.hoaMonthly"] = fees.hoaMonthly;
      if (hasOwn(fees, "hoaFee")) $set["fees.hoaFee"] = fees.hoaFee;
      if (hasOwn(fees, "hoaFrequency")) $set["fees.hoaFrequency"] = cleanString(fees.hoaFrequency);
      if (hasOwn(fees, "tax")) $set["fees.tax"] = fees.tax;
      if (hasOwn(fees, "taxRate")) $set["fees.taxRate"] = fees.taxRate;
      if (hasOwn(fees, "mudTaxRate")) $set["fees.mudTaxRate"] = fees.mudTaxRate;
      if (hasOwn(fees, "pidFee")) $set["fees.pidFee"] = fees.pidFee;
      if (hasOwn(fees, "pidFeeFrequency")) $set["fees.pidFeeFrequency"] = cleanString(fees.pidFeeFrequency);
      if (hasOwn(fees, "mudFee")) $set["fees.mudFee"] = fees.mudFee;
      if (hasOwn(fees, "mudFeeAmount")) $set["fees.mudFee"] = fees.mudFeeAmount;
      if (hasOwn(fees, "pid")) $set["fees.pid"] = fees.pid;
      if (hasOwn(fees, "hasPid")) $set["fees.hasPid"] = fees.hasPid;
      if (hasOwn(fees, "mud")) $set["fees.mud"] = fees.mud;
      if (hasOwn(fees, "hasMud")) $set["fees.hasMud"] = fees.hasMud;
      if (hasOwn(fees, "taxDistrict")) $set["fees.taxDistrict"] = cleanString(fees.taxDistrict);
      if (hasOwn(fees, "hoaIncludes")) {
        $set["fees.hoaIncludes"] = normalizeStringList(fees.hoaIncludes, { maxItems: 20 });
      }
    }
  }
  if (hasOwn(input, "hoaMonthly") || hasOwnDefined(fees, "hoaMonthly") || hasOwnDefined(fees, "hoaFee")) {
    $set.hoaMonthly = hasOwn(input, "hoaMonthly")
      ? input.hoaMonthly
      : hasOwnDefined(fees, "hoaMonthly")
        ? fees.hoaMonthly
        : fees.hoaFee;
  }
  if (hasOwn(input, "taxRate") || hasOwnDefined(fees, "taxRate")) {
    // Store the numeric taxRate exactly as published; publisher controls decimal vs percent format.
    $set.taxRate = hasOwn(input, "taxRate") ? input.taxRate : fees.taxRate;
  }
  if (hasOwn(input, "mudTaxRate") || hasOwnDefined(fees, "mudTaxRate")) {
    // Canonical KeepUp MUD value is a decimal rate (for example 0.0078 -> 0.78%).
    $set.mudTaxRate = hasOwn(input, "mudTaxRate") ? input.mudTaxRate : fees.mudTaxRate;
  }
  if (hasOwn(input, "mudFeeAmount") || hasOwnDefined(fees, "mudFee") || hasOwnDefined(fees, "mudFeeAmount")) {
    $set.mudFeeAmount = hasOwn(input, "mudFeeAmount")
      ? input.mudFeeAmount
      : hasOwnDefined(fees, "mudFeeAmount")
        ? fees.mudFeeAmount
        : fees.mudFee;
  }
  if (hasOwn(input, "pid") || hasOwnDefined(fees, "pid") || hasOwnDefined(fees, "hasPid")) {
    $set.pid = hasOwn(input, "pid")
      ? input.pid
      : hasOwnDefined(fees, "pid")
        ? fees.pid
        : fees.hasPid;
  }
  if (hasOwn(input, "mud") || hasOwnDefined(fees, "mud") || hasOwnDefined(fees, "hasMud")) {
    $set.mud = hasOwn(input, "mud")
      ? input.mud
      : hasOwnDefined(fees, "mud")
        ? fees.mud
        : fees.hasMud;
  }
  if (hasOwn(input, "taxDistrict") || hasOwnDefined(fees, "taxDistrict")) {
    $set.taxDistrict = cleanString(
      hasOwn(input, "taxDistrict") ? input.taxDistrict : fees.taxDistrict,
    );
  }
  if (hasOwn(input, "hoaIncludes") || hasOwnDefined(fees, "hoaIncludes")) {
    $set.hoaIncludes = normalizeStringList(
      hasOwn(input, "hoaIncludes") ? input.hoaIncludes : fees.hoaIncludes,
      { maxItems: 20 },
    );
  }

  const doc = await col
    .findOneAndUpdate(
      filter,
      {
        $set,
        ...(allowCreate
          ? {
              $setOnInsert: {
                ...$setOnInsert,
                ...(publicCommunityId ? { _id: publicCommunityId } : {}),
              },
            }
          : {}),
      },
      { upsert: allowCreate, returnDocument: "after" },
    )
    .then((res) => {
      if (!res) return null;
      if (typeof res === "object" && Object.prototype.hasOwnProperty.call(res, "value")) {
        return res.value;
      }
      return res;
    })
    .catch(() => null);
  if (!doc) return null;
  const resolvedKeepup =
    doc.keepupCommunityId ?? doc.communityId ? String(doc.keepupCommunityId ?? doc.communityId) : undefined;
  const resolvedCanonical = doc.canonicalKey || canonicalKey || computeCanonicalKey(doc) || undefined;
  if (resolvedCanonical && !doc.canonicalKey) {
    col.updateOne({ _id: doc._id }, { $set: { canonicalKey: resolvedCanonical } }).catch(() => {});
  }
  return {
    _id: doc._id.toString(),
    keepupCommunityId: resolvedKeepup,
    canonicalKey: resolvedCanonical,
    slug: doc.slug,
  };
}

module.exports = {
  resolvePublicCommunity,
  resolveCanonicalCommunityById,
  resolveOrCreatePublicCommunity,
  ensureCommunityIndexes,
  computeCanonicalKey,
  COMMUNITY_COLLECTION_CANDIDATES,
};
