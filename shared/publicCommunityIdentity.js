"use strict";

const {
  absolutizeAssetUrl,
  normalizeHighlights,
  normalizeStringList,
} = require("./communityContent");

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && typeof value.toHexString === "function") {
    return value.toHexString();
  }
  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }
  return "";
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function mapPublicCommunityIdentitySummary(doc) {
  const imageUrls = normalizeStringList(doc?.imageUrls, { maxItems: 3 })
    .map((url) => absolutizeAssetUrl(url))
    .filter(Boolean);
  const legacyPreview = normalizeStringList(
    [
      ...(Array.isArray(doc?.heroImages) ? doc.heroImages : []),
      ...(Array.isArray(doc?.images) ? doc.images : []),
      ...(Array.isArray(doc?.photos) ? doc.photos : []),
    ],
    { maxItems: 3 },
  )
    .map((url) => absolutizeAssetUrl(url))
    .filter(Boolean);
  const heroImageUrl =
    absolutizeAssetUrl(doc?.heroImageUrl) ||
    absolutizeAssetUrl(doc?.heroImage) ||
    absolutizeAssetUrl(doc?.mapImage) ||
    absolutizeAssetUrl(doc?.image) ||
    imageUrls[0] ||
    legacyPreview[0] ||
    null;
  const imageUrlsPreview = normalizeStringList(
    [heroImageUrl, ...imageUrls, ...legacyPreview],
    { maxItems: 3 },
  );
  const highlights = normalizeHighlights(doc?.highlights, { maxItems: 2 });

  return {
    _id: toIdString(doc?._id),
    slug: pickString(doc?.slug),
    name: pickString(doc?.name, doc?.title, doc?.communityName),
    city: pickString(doc?.city, doc?.addressCity),
    state: pickString(doc?.state, doc?.addressState),
    heroImageUrl,
    imageUrlsPreview: imageUrlsPreview.length ? imageUrlsPreview : undefined,
    photosPreview: imageUrlsPreview.length ? imageUrlsPreview : undefined,
    highlights: highlights.length ? highlights : undefined,
  };
}

module.exports = {
  mapPublicCommunityIdentitySummary,
};
