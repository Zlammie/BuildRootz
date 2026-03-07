function normalizePublicSlug(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim().toLowerCase();
  if (!raw) return "";
  return raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = {
  normalizePublicSlug,
};
