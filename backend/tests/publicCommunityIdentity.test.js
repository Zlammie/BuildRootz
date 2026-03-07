const test = require("node:test");
const assert = require("node:assert/strict");

const { mapPublicCommunityIdentitySummary } = require("../../shared/publicCommunityIdentity");

test("community identity summary exposes hero, preview images, and highlight snippets", () => {
  const originalBase = process.env.KEEPUP_PUBLIC_BASE_URL;
  process.env.KEEPUP_PUBLIC_BASE_URL = "https://keepup.test";

  try {
    const summary = mapPublicCommunityIdentitySummary({
      _id: "507f1f77bcf86cd799439011",
      slug: "ten-mile-creek",
      name: "Ten Mile Creek",
      city: "Celina",
      state: "TX",
      heroImageUrl: "/uploads/communities/ten-mile-creek-hero.jpg",
      imageUrls: [
        "/uploads/communities/ten-mile-creek-hero.jpg",
        "uploads/communities/ten-mile-creek-entry.jpg",
        "https://cdn.test/communities/ten-mile-creek-clubhouse.jpg",
      ],
      highlights: ["Amenity center", "Greenbelt lots", "Amenity center"],
    });

    assert.equal(summary._id, "507f1f77bcf86cd799439011");
    assert.equal(
      summary.heroImageUrl,
      "https://keepup.test/uploads/communities/ten-mile-creek-hero.jpg",
    );
    assert.deepEqual(summary.imageUrlsPreview, [
      "https://keepup.test/uploads/communities/ten-mile-creek-hero.jpg",
      "https://keepup.test/uploads/communities/ten-mile-creek-entry.jpg",
      "https://cdn.test/communities/ten-mile-creek-clubhouse.jpg",
    ]);
    assert.deepEqual(summary.photosPreview, summary.imageUrlsPreview);
    assert.deepEqual(summary.highlights, ["Amenity center", "Greenbelt lots"]);
  } finally {
    process.env.KEEPUP_PUBLIC_BASE_URL = originalBase;
  }
});
