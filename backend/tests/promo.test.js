const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePromo,
  normalizePromoMode,
  computeEffectivePromos,
} = require("../../shared/promo");

test("normalizePromo accepts strings and objects", () => {
  assert.deepEqual(normalizePromo("  Limited-time savings  "), {
    headline: "Limited-time savings",
    description: null,
    disclaimer: null,
  });

  assert.deepEqual(
    normalizePromo({
      headline: "Rate buydown",
      description: "Save on monthly payments.",
      disclaimer: "On select homes only.",
    }),
    {
      headline: "Rate buydown",
      description: "Save on monthly payments.",
      disclaimer: "On select homes only.",
    },
  );
});

test("computeEffectivePromos uses add mode by default", () => {
  const promos = computeEffectivePromos({
    communityPromo: "Community promo",
    listingPromo: { headline: "Listing promo" },
  });

  assert.deepEqual(promos, [
    { headline: "Community promo", description: null, disclaimer: null },
    { headline: "Listing promo", description: null, disclaimer: null },
  ]);
  assert.equal(normalizePromoMode(undefined), "add");
});

test("computeEffectivePromos returns listing only in override mode", () => {
  const promos = computeEffectivePromos({
    communityPromo: "Community promo",
    listingPromo: {
      headline: "Listing promo",
      description: "This home only.",
    },
    promoMode: "override",
  });

  assert.deepEqual(promos, [
    {
      headline: "Listing promo",
      description: "This home only.",
      disclaimer: null,
    },
  ]);
});

test("computeEffectivePromos handles single-sided promos", () => {
  assert.deepEqual(
    computeEffectivePromos({ communityPromo: "Community only" }),
    [{ headline: "Community only", description: null, disclaimer: null }],
  );
  assert.deepEqual(
    computeEffectivePromos({ listingPromo: "Listing only", promoMode: "override" }),
    [{ headline: "Listing only", description: null, disclaimer: null }],
  );
  assert.deepEqual(computeEffectivePromos({}), []);
});
