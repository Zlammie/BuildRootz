const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildListingsMongoQuery,
  buildListingsSort,
  matchesLegacyListing,
  sortLegacyListings,
  paginateListings,
} = require("../../shared/listingsQuery");

test("buildListingsMongoQuery defaults to active-or-legacy listings", () => {
  const query = buildListingsMongoQuery();
  assert.deepEqual(query.$or, [{ isActive: true }, { isActive: { $exists: false } }]);
});

test("buildListingsMongoQuery applies common filters", () => {
  const query = buildListingsMongoQuery({
    publicCommunityVariants: ["community-1"],
    companyVariants: ["company-1"],
    keepupFloorPlanId: "fp-100",
    planCatalogVariants: ["plan-1"],
    status: "Available",
    minPrice: 300000,
    maxPrice: 500000,
    bedsMin: 3,
    bathsMin: 2,
    minSqft: 1500,
    maxSqft: 2500,
    q: "Frisco",
  });

  assert.deepEqual(query.publicCommunityId, { $in: ["community-1"] });
  assert.deepEqual(query.companyId, { $in: ["company-1"] });
  assert.equal(query.keepupFloorPlanId, "fp-100");
  assert.deepEqual(query.planCatalogId, { $in: ["plan-1"] });
  assert.ok(query.status.$regex.test("available"));
  assert.equal(Array.isArray(query.$and), true);
  assert.equal(query.$and.length, 5);
});

test("buildListingsSort supports newest and price sorts", () => {
  assert.deepEqual(buildListingsSort("newest"), { lastPublishedAt: -1, updatedAt: -1, _id: -1 });
  assert.deepEqual(buildListingsSort("price_asc"), { price: 1, _id: -1 });
  assert.deepEqual(buildListingsSort("price_desc"), { price: -1, _id: -1 });
});

test("matchesLegacyListing enforces active query filters", () => {
  const listing = {
    status: "Available",
    publicCommunityId: "c-1",
    keepupBuilderId: "b-1",
    price: 410000,
    beds: 4,
    baths: 2.5,
    sqft: 2200,
    keepupFloorPlanId: "fp-100",
    address: "101 Main Street",
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
  };
  const pass = matchesLegacyListing(listing, {
    publicCommunityId: "c-1",
    companyId: "b-1",
    keepupFloorPlanId: "fp-100",
    status: "available",
    minPrice: 400000,
    maxPrice: 450000,
    bedsMin: 3,
    bathsMin: 2,
    minSqft: 1800,
    maxSqft: 2500,
    q: "frisco",
  });
  assert.equal(pass, true);

  const fail = matchesLegacyListing(listing, {
    minPrice: 500000,
  });
  assert.equal(fail, false);
});

test("sortLegacyListings and paginateListings return deterministic slices", () => {
  const listings = [
    { id: "a", price: 450000 },
    { id: "b", price: 350000 },
    { id: "c", price: 550000 },
  ];
  const sorted = sortLegacyListings(listings, "price_asc");
  assert.deepEqual(sorted.map((row) => row.id), ["b", "a", "c"]);

  const page = paginateListings(sorted, 1, 2);
  assert.deepEqual(page.map((row) => row.id), ["b", "a"]);
});
