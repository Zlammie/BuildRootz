const test = require("node:test");
const assert = require("node:assert/strict");

const {
  mapBuilderSnapshot,
  findCommunityInSnapshot,
} = require("../../services/brzSnapshotMapper");

test("mapper normalizes communities and community details safely", () => {
  const originalBase = process.env.KEEPUP_PUBLIC_BASE_URL;
  process.env.KEEPUP_PUBLIC_BASE_URL = "https://keepup.test";
  const payload = {
    builder: {
      slug: "builder-a",
      name: "Builder A",
      logoUrl: "https://cdn.test/logo.png",
      websiteUrl: "https://builder-a.test",
    },
    communities: [
      {
        id: "community-1",
        name: "Willow Creek",
        city: "Prosper",
        state: "TX",
        overview: "Fallback overview should not win.",
        totalLots: "120",
        hoaAmount: 95,
        hoaFrequency: "monthly",
        schools: { district: "Prosper ISD" },
        primaryContact: { name: "Jane Doe", phone: "555-0101" },
        webData: {
          overview: "Curated overview from web data.",
          highlights: ["Resort pool", "Trail network", "Resort pool"],
          heroImageUrl: "/uploads/communities/willow-hero.jpg",
          imageUrls: [
            "/uploads/communities/willow-hero.jpg",
            "uploads/communities/willow-entry.jpg",
            "https://cdn.test/communities/willow-clubhouse.jpg",
          ],
        },
        floorPlans: [{ id: "plan-1", name: "Briar", basePriceFrom: 410000, beds: 4, baths: 3, sqft: 2500 }],
      },
    ],
  };

  try {
    const mapped = mapBuilderSnapshot(payload, "builder-a");
    assert.equal(mapped.builder.slug, "builder-a");
    assert.equal(mapped.communities.length, 1);
    assert.equal(mapped.floorPlans.length, 1);
    assert.equal(mapped.communities[0].communityDetails.totalLots, 120);
    assert.equal(mapped.communities[0].communityDetails.schools.district, "Prosper ISD");
    assert.equal(mapped.communities[0].communityDetails.primaryContact.name, "Jane Doe");
    assert.equal(mapped.communities[0].overview, "Curated overview from web data.");
    assert.deepEqual(mapped.communities[0].highlights, ["Resort pool", "Trail network"]);
    assert.equal(
      mapped.communities[0].heroImageUrl,
      "https://keepup.test/uploads/communities/willow-hero.jpg",
    );
    assert.deepEqual(mapped.communities[0].imageUrls, [
      "https://keepup.test/uploads/communities/willow-hero.jpg",
      "https://keepup.test/uploads/communities/willow-entry.jpg",
      "https://cdn.test/communities/willow-clubhouse.jpg",
    ]);
  } finally {
    process.env.KEEPUP_PUBLIC_BASE_URL = originalBase;
  }
});

test("community matching supports slug, id, and slugified name fallback", () => {
  const communities = [
    { id: "abc123", slug: "river-walk", keepupCommunityId: "k-1", name: "River Walk" },
    { id: "def456", name: "Sunset Ridge", keepupCommunityId: "k-2" },
  ];

  assert.equal(findCommunityInSnapshot(communities, { communitySlug: "river-walk" })?.id, "abc123");
  assert.equal(findCommunityInSnapshot(communities, { communityId: "k-2" })?.id, "def456");
  assert.equal(findCommunityInSnapshot(communities, { communitySlug: "sunset-ridge" })?.id, "def456");
});
