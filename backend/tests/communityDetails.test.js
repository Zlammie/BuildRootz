const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeCommunityDetails,
  withCommunityDetails,
} = require("../../shared/communityDetails");

test("publishing payload includes communityDetails with partial fields", () => {
  const source = {
    primaryContact: { name: "Jane Doe", phone: "555-0101" },
    totalLots: "142",
    schools: { district: "Frisco ISD", elementary: "Miller Elementary" },
    fees: { hoaFee: 125, hoaFrequency: "monthly" },
    earnestMoney: "$5,000",
    realtorIncentives: { enabled: false, amount: "3%", notes: "Ask sales office." },
    pidMud: { hasPid: true, hasMud: false, notes: "PID active, no MUD." },
  };

  const details = normalizeCommunityDetails(source);

  assert.deepEqual(details.primaryContact, {
    name: "Jane Doe",
    role: null,
    phone: "555-0101",
    email: null,
  });
  assert.equal(details.totalLots, 142);
  assert.deepEqual(details.schools, {
    district: "Frisco ISD",
    elementary: "Miller Elementary",
    middle: null,
    high: null,
    text: null,
  });
  assert.equal(details.hoaAmount, 125);
  assert.equal(details.hoaFrequency, "monthly");
  assert.equal(details.earnestMoney, 5000);
  assert.deepEqual(details.realtorIncentives, {
    enabled: false,
    amount: "3%",
    notes: "Ask sales office.",
  });
  assert.deepEqual(details.pidMud, {
    hasPid: true,
    hasMud: false,
    notes: "PID active, no MUD.",
  });
});

test("bootstrap community payload carries communityDetails", () => {
  const baseCommunity = {
    id: "community-1",
    name: "Demo Community",
  };
  const publishedDoc = {
    id: "community-1",
    name: "Demo Community",
    communityDetails: {
      totalLots: 88,
      schools: { district: "Prosper ISD" },
      realtorIncentives: { enabled: true, amount: 3000 },
    },
  };

  const payload = withCommunityDetails(baseCommunity, publishedDoc);

  assert.ok(payload.communityDetails, "communityDetails is missing from bootstrap payload");
  assert.equal(payload.communityDetails.totalLots, 88);
  assert.equal(payload.communityDetails.schools.district, "Prosper ISD");
  assert.equal(payload.communityDetails.realtorIncentives.enabled, true);
  assert.equal(payload.communityDetails.realtorIncentives.amount, 3000);
});
