const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  normalizeCompanyIdsForAggregation,
  buildCommunityListingCountsMatch,
} = require("../../shared/communityListingCounts");

test("normalizeCompanyIdsForAggregation ignores invalid ids and deduplicates", () => {
  const validA = new mongoose.Types.ObjectId().toHexString();
  const validB = new mongoose.Types.ObjectId().toHexString();
  const ids = normalizeCompanyIdsForAggregation([validA, validA.toUpperCase(), "bad-id", validB]);
  assert.equal(ids.length, 2);
  assert.ok(ids.includes(validA.toLowerCase()));
  assert.ok(ids.includes(validB.toLowerCase()));
});

test("buildCommunityListingCountsMatch builds active scoped match", () => {
  const communityObjectId = new mongoose.Types.ObjectId();
  const companyObjectIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const match = buildCommunityListingCountsMatch({
    communityObjectId,
    companyObjectIds,
    includeActiveOnly: true,
  });
  assert.equal(String(match.publicCommunityId), String(communityObjectId));
  assert.equal(match.isActive, true);
  assert.equal(Array.isArray(match.companyId.$in), true);
  assert.equal(match.companyId.$in.length, 2);
});
