function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isObjectId(value) {
  return /^[a-f\d]{24}$/i.test(normalizeString(value));
}

/**
 * @param {string[] | undefined} companyIds
 * @returns {string[]}
 */
function normalizeCompanyIdsForAggregation(companyIds = []) {
  if (!Array.isArray(companyIds)) return [];
  const unique = new Set();
  companyIds.forEach((value) => {
    const normalized = normalizeString(value);
    if (!isObjectId(normalized)) return;
    unique.add(normalized.toLowerCase());
  });
  return Array.from(unique);
}

/**
 * @param {{
 *   communityObjectId: import("mongodb").ObjectId;
 *   companyObjectIds?: import("mongodb").ObjectId[];
 *   includeActiveOnly?: boolean;
 * }} params
 * @returns {{
 *   publicCommunityId: import("mongodb").ObjectId;
 *   isActive?: boolean;
 *   companyId?: { $in: import("mongodb").ObjectId[] };
 * }}
 */
function buildCommunityListingCountsMatch({
  communityObjectId,
  companyObjectIds = [],
  includeActiveOnly = true,
}) {
  const match = { publicCommunityId: communityObjectId };
  if (includeActiveOnly) {
    match.isActive = true;
  }
  if (Array.isArray(companyObjectIds) && companyObjectIds.length) {
    match.companyId = { $in: companyObjectIds };
  }
  return match;
}

module.exports = {
  normalizeCompanyIdsForAggregation,
  buildCommunityListingCountsMatch,
};
