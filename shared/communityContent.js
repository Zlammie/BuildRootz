"use strict";

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function firstString(...values) {
  for (const value of values) {
    const normalized = cleanString(value);
    if (normalized) return normalized;
  }
  return null;
}

function resolveAssetBaseUrl(options = {}) {
  return firstString(
    options.baseUrl,
    process.env.KEEPUP_PUBLIC_BASE_URL,
    process.env.BASE_URL,
  );
}

function toRelativeUploadPath(value) {
  const normalized = cleanString(value);
  if (!normalized) return null;
  if (/^\/uploads\//i.test(normalized)) return normalized;
  if (/^uploads\//i.test(normalized)) return `/${normalized.replace(/^\/+/, "")}`;
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      if (/^\/uploads\//i.test(parsed.pathname)) {
        return `${parsed.pathname}${parsed.search || ""}`;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function absolutizeAssetUrl(url, options = {}) {
  const normalized = cleanString(url);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (/^\/\//.test(normalized)) return `https:${normalized}`;

  const baseUrl = resolveAssetBaseUrl(options);
  if (!baseUrl) {
    return normalized.startsWith("uploads/") ? `/${normalized}` : normalized;
  }

  const path = normalized.startsWith("/") ? normalized : `/${normalized.replace(/^\/+/, "")}`;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function normalizePublicAssetUrl(url, options = {}) {
  const normalized = cleanString(url);
  if (!normalized) return null;
  const relativeUploadPath = toRelativeUploadPath(normalized);
  if (relativeUploadPath) return relativeUploadPath;
  return absolutizeAssetUrl(normalized, options);
}

function normalizeStringList(value, options = {}) {
  const maxItems = Number.isFinite(options.maxItems) ? options.maxItems : 20;
  const entries = Array.isArray(value)
    ? value
    : value === null || value === undefined
      ? []
      : [value];
  const seen = new Set();
  const out = [];

  entries.forEach((entry) => {
    let candidate = null;
    if (typeof entry === "string") {
      candidate = cleanString(entry);
    } else if (entry && typeof entry === "object") {
      candidate = firstString(entry.url, entry.src, entry.href);
    }
    if (!candidate) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  });

  return out.slice(0, Math.max(0, maxItems));
}

function normalizeHighlights(value, options = {}) {
  const maxItems = Number.isFinite(options.maxItems) ? options.maxItems : 6;
  return normalizeStringList(value, { maxItems }).slice(0, maxItems);
}

function collectCommunityImageUrls(input, options = {}) {
  const source = asObject(input);
  const presentation = asObject(source.presentation);
  const urls = [
    ...normalizeStringList(
      [
        source.heroImageUrl,
        source.heroImage,
        source.mapImage,
        source.image,
        presentation.heroImageUrl,
      ],
      { maxItems: 32 },
    ),
    ...normalizeStringList(source.imageUrls, { maxItems: 32 }),
    ...normalizeStringList(source.images, { maxItems: 32 }),
    ...normalizeStringList(source.heroImages, { maxItems: 32 }),
    ...normalizeStringList(source.photos, { maxItems: 32 }),
    ...normalizeStringList(source.gallery, { maxItems: 32 }),
  ]
    .map((url) => absolutizeAssetUrl(url, options))
    .filter(Boolean);

  const deduped = normalizeStringList(urls, { maxItems: 20 });
  const explicitHero = hasOwn(source, "heroImageUrl") || hasOwn(source, "heroImage") || hasOwn(presentation, "heroImageUrl");
  const heroCandidate = explicitHero
    ? firstString(source.heroImageUrl, source.heroImage, presentation.heroImageUrl)
    : deduped[0] || null;
  const heroUrl = absolutizeAssetUrl(heroCandidate, options) || deduped[0] || null;

  return {
    heroUrl,
    urls: deduped.slice(0, 20),
  };
}

function extractCommunityContent(preferredInput, fallbackInput, options = {}) {
  const preferred = asObject(preferredInput);
  const fallback = asObject(fallbackInput);
  const preferredImages = collectCommunityImageUrls(preferred, options);
  const fallbackImages = collectCommunityImageUrls(fallback, options);
  const mergedUrls = normalizeStringList(
    [...preferredImages.urls, ...fallbackImages.urls],
    { maxItems: 20 },
  );
  const preferredHighlights = normalizeHighlights(
    preferred.highlights || preferred.keyHighlights || preferred.bullets,
    { maxItems: 6 },
  );
  const fallbackHighlights = normalizeHighlights(
    fallback.highlights || fallback.keyHighlights || fallback.bullets,
    { maxItems: 6 },
  );

  return {
    overview: firstString(
      preferred.overview,
      preferred.description,
      preferred.summary,
      fallback.overview,
      fallback.description,
      fallback.summary,
    ),
    highlights: preferredHighlights.length ? preferredHighlights : fallbackHighlights,
    heroImageUrl:
      preferredImages.heroUrl ||
      fallbackImages.heroUrl ||
      mergedUrls[0] ||
      null,
    imageUrls: mergedUrls,
  };
}

module.exports = {
  asArray,
  asObject,
  cleanString,
  firstString,
  absolutizeAssetUrl,
  normalizePublicAssetUrl,
  normalizeStringList,
  normalizeHighlights,
  collectCommunityImageUrls,
  extractCommunityContent,
};
