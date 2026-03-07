const test = require("node:test");
const assert = require("node:assert/strict");

const { mergeCommunityBuilderView } = require("../services/builderInCommunityResolver");

test("mergeCommunityBuilderView keeps legacy values when bic is missing", () => {
  const legacy = {
    description: "Legacy description",
    communityDetails: {
      totalLots: 12,
      primaryContact: { name: "Legacy Name", phone: "555-0001", email: "legacy@test.com" },
    },
  };

  const merged = mergeCommunityBuilderView({ legacy, bic: null });

  assert.equal(merged.description, "Legacy description");
  assert.equal(merged.communityDetails.totalLots, 12);
  assert.equal(merged.communityDetails.primaryContact.email, "legacy@test.com");
});

test("mergeCommunityBuilderView applies bic-first data and contact visibility", () => {
  const legacy = {
    communityDetails: {
      totalLots: 12,
      primaryContact: { name: "Legacy Name", phone: "555-0001", email: "legacy@test.com" },
      schools: { district: "Legacy ISD" },
      hoaAmount: 50,
      hoaFrequency: "monthly",
      earnestMoney: 3000,
      realtorIncentives: { enabled: true, amount: 4000, notes: "Legacy notes" },
      pidMud: { hasPid: false, hasMud: false },
    },
  };

  const bic = {
    webData: {
      totalLots: 44,
      primaryContact: { name: "BIC Name", phone: "555-2222", email: "bic@test.com" },
      contactVisibility: { showName: true, showPhone: false, showEmail: false },
      schools: { elementary: "Elm Elementary" },
      ammenities: [{ label: "Pool" }, { label: "pickleball" }, { label: "Pool" }],
      hoa: { amount: 99, cadence: "monthly" },
      hasPID: true,
      hasMUD: false,
      earnestMoney: { amount: 5000, visibility: "hidden" },
      realtorCommission: { amount: 3, visibility: "public" },
      notesInternal: "internal",
    },
    presentation: { description: "BIC description", promotion: "Promo", heroImageUrl: "https://img.test/hero.jpg" },
    modelsSummary: [{ address: "123 Main St", listingId: "abc", floorPlanName: "Plan A" }],
  };

  const merged = mergeCommunityBuilderView({ legacy, bic });

  assert.equal(merged.description, "BIC description");
  assert.equal(merged.promotion, "Promo");
  assert.equal(merged.heroImageUrl, "https://img.test/hero.jpg");
  assert.equal(merged.communityDetails.totalLots, 44);
  assert.equal(merged.communityDetails.primaryContact.name, "BIC Name");
  assert.equal(merged.communityDetails.primaryContact.phone, null);
  assert.equal(merged.communityDetails.primaryContact.email, null);
  assert.equal(merged.communityDetails.schools.elementary, "Elm Elementary");
  assert.equal(merged.communityDetails.hoaAmount, 99);
  assert.equal(merged.communityDetails.earnestMoney, null);
  assert.equal(merged.communityDetails.realtorIncentives.enabled, true);
  assert.equal(merged.communityDetails.realtorIncentives.amount, 3);
  assert.equal(merged.communityDetails.pidMud.hasPid, true);
  assert.equal(merged.modelAddress.street, "123 Main St");
  assert.deepEqual(merged.amenities, ["Pool", "pickleball"]);
});
