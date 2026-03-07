const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatPercentFromDecimal,
  normalizeCommunityAmenitiesForRender,
  normalizeCommunityProductTypesForRender,
  mergeBuilderInCommunityIntoPublicCommunity,
} = require("../../shared/publicCommunityView");

test("normalizeCommunityAmenitiesForRender trims and dedupes labels", () => {
  const amenities = normalizeCommunityAmenitiesForRender([
    { label: "Pool" },
    "Walking Trails",
    { label: "pool" },
    { label: " " },
  ]);

  assert.deepEqual(amenities, [
    { label: "Pool" },
    { label: "Walking Trails" },
  ]);
});

test("normalizeCommunityProductTypesForRender trims and dedupes labels", () => {
  const productTypes = normalizeCommunityProductTypesForRender([
    { label: "22' Townhomes" },
    "45' Homesites",
    { label: "22' townhomes" },
    { label: " " },
  ]);

  assert.deepEqual(productTypes, [
    { label: "22' Townhomes" },
    { label: "45' Homesites" },
  ]);
});

test("mergeBuilderInCommunityIntoPublicCommunity surfaces existing community details as top-level fallbacks", () => {
  const merged = mergeBuilderInCommunityIntoPublicCommunity({
    id: "community-1",
    communityDetails: {
      primaryContact: {
        name: "Legacy Agent",
        phone: "555-1111",
        email: "legacy@example.com",
      },
      schools: {
        district: "Prosper ISD",
        elementary: "Walnut Grove",
        middle: "Reynolds",
        high: "Prosper High",
      },
    },
  });

  assert.deepEqual(merged.primaryContact, {
    name: "Legacy Agent",
    phone: "555-1111",
    email: "legacy@example.com",
  });
  assert.deepEqual(merged.schools, {
    isd: "Prosper ISD",
    elementary: "Walnut Grove",
    middle: "Reynolds",
    high: "Prosper High",
  });
});

test("mergeBuilderInCommunityIntoPublicCommunity merges builder webData and derives monthly hoa", () => {
  const merged = mergeBuilderInCommunityIntoPublicCommunity(
    {
      id: "community-2",
      hoaMonthly: null,
      communityDetails: {
        primaryContact: { name: "Legacy Agent" },
        schools: { district: "Legacy ISD" },
        pidMud: { hasPid: false, hasMud: false },
      },
    },
    {
      webData: {
        primaryContact: {
          name: "Onsite Team",
          phone: "555-2222",
          email: "onsite@example.com",
        },
        contactVisibility: {
          showName: true,
          showPhone: true,
          showEmail: false,
        },
        schools: {
          isd: "Celina ISD",
          elementary: "O'Dell",
          middle: "Moore",
          high: "Celina High",
        },
        amenities: [
          { label: "Lazy River" },
          { label: "Dog Park" },
          { label: "lazy river" },
        ],
        productTypes: [
          { label: "22' Townhomes" },
          { label: "45' Homesites" },
          { label: "22' townhomes" },
        ],
        hoa: {
          amount: 1200,
          cadence: "annual",
        },
        taxRate: 2.15,
        mudTaxRate: 0.0078,
        mudFeeAmount: 925,
        hasPID: true,
        hasMUD: false,
      },
    },
  );

  assert.equal(merged.hoaMonthly, 100);
  assert.equal(merged.taxRate, 2.15);
  assert.equal(merged.mudTaxRate, 0.0078);
  assert.equal(merged.mudFeeAmount, 925);
  assert.equal(formatPercentFromDecimal(merged.mudTaxRate), "0.78%");
  assert.equal(merged.pid, true);
  assert.equal(merged.mud, false);
  assert.deepEqual(merged.primaryContact, {
    name: "Onsite Team",
    phone: "555-2222",
    email: null,
  });
  assert.deepEqual(merged.schools, {
    isd: "Celina ISD",
    elementary: "O'Dell",
    middle: "Moore",
    high: "Celina High",
  });
  assert.deepEqual(merged.amenities, ["Lazy River", "Dog Park"]);
  assert.deepEqual(merged.productTypes, ["22' Townhomes", "45' Homesites"]);
  assert.equal(merged.communityDetails.hoaAmount, 1200);
  assert.equal(merged.communityDetails.hoaFrequency, "annual");
  assert.equal(merged.communityDetails.pidMud.hasPid, true);
  assert.equal(merged.communityDetails.pidMud.hasMud, false);
  assert.equal(merged.communityDetails.schools.district, "Celina ISD");
});

test("mergeBuilderInCommunityIntoPublicCommunity keeps monthly hoa as-is", () => {
  const merged = mergeBuilderInCommunityIntoPublicCommunity(
    { id: "community-3" },
    {
      webData: {
        hoa: {
          amount: 95,
          cadence: "monthly",
        },
      },
    },
  );

  assert.equal(merged.hoaMonthly, 95);
});

test("mergeBuilderInCommunityIntoPublicCommunity preserves existing fee fields when bic is missing", () => {
  const merged = mergeBuilderInCommunityIntoPublicCommunity({
    id: "community-4",
    hoaMonthly: 88,
    taxRate: 0.0215,
    pid: false,
    mud: true,
  });

  assert.equal(merged.hoaMonthly, 88);
  assert.equal(merged.taxRate, 0.0215);
  assert.equal(merged.pid, false);
  assert.equal(merged.mud, true);
});

test("mergeBuilderInCommunityIntoPublicCommunity keeps taxRate as a decimal for estimate math", () => {
  const merged = mergeBuilderInCommunityIntoPublicCommunity(
    { id: "community-5" },
    {
      webData: {
        taxRate: 0.0215,
      },
    },
  );

  assert.equal(merged.taxRate, 0.0215);
  const estimatedAnnualTaxes = 450000 * merged.taxRate;
  assert.equal(estimatedAnnualTaxes, 9675);
});

test("formatPercentFromDecimal trims trailing zeros", () => {
  assert.equal(formatPercentFromDecimal(0.0078), "0.78%");
  assert.equal(formatPercentFromDecimal(0.01), "1%");
  assert.equal(formatPercentFromDecimal(null), null);
});

test("mergeBuilderInCommunityIntoPublicCommunity keeps legacy mud fee when rate is missing", () => {
  const merged = mergeBuilderInCommunityIntoPublicCommunity(
    { id: "community-6" },
    {
      webData: {
        mudFeeAmount: 1250,
      },
    },
  );

  assert.equal(merged.mudTaxRate, undefined);
  assert.equal(merged.mudFeeAmount, 1250);
  assert.equal(formatPercentFromDecimal(merged.mudTaxRate), null);
});
