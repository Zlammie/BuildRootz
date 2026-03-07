function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizePromo(input) {
  if (input === null) return null;
  const stringPromo = cleanString(input);
  if (stringPromo) {
    return {
      headline: stringPromo,
      description: null,
      disclaimer: null,
    };
  }

  const obj = asObject(input);
  if (!obj) return null;

  const promo = {
    headline: cleanString(obj.headline),
    description: cleanString(obj.description),
    disclaimer: cleanString(obj.disclaimer),
  };

  if (!promo.headline && !promo.description && !promo.disclaimer) {
    return null;
  }

  return promo;
}

function normalizePromoMode(value) {
  const normalized = cleanString(value)?.toLowerCase();
  return normalized === "override" ? "override" : "add";
}

function computeEffectivePromos({ communityPromo, listingPromo, promoMode } = {}) {
  const normalizedCommunityPromo = normalizePromo(communityPromo);
  const normalizedListingPromo = normalizePromo(listingPromo);

  if (!normalizedCommunityPromo && !normalizedListingPromo) {
    return [];
  }

  if (normalizePromoMode(promoMode) === "override" && normalizedListingPromo) {
    return [normalizedListingPromo];
  }

  return [normalizedCommunityPromo, normalizedListingPromo].filter(Boolean);
}

module.exports = {
  normalizePromo,
  normalizePromoMode,
  computeEffectivePromos,
};
