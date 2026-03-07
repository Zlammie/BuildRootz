function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const EM_DASH = "\u2014";
const MOJIBAKE_EM_DASH = "\u00E2\u20AC\u201D";
const DOUBLE_MOJIBAKE_EM_DASH = "\u00C3\u00A2\u00E2\u201A\u00AC\u00E2\u20AC\u009D";

function displayValue(value) {
  if (value === null || value === undefined) return EM_DASH;
  const text = typeof value === "string" ? value.trim() : String(value).trim();
  if (!text) return EM_DASH;
  if (text === MOJIBAKE_EM_DASH || text === DOUBLE_MOJIBAKE_EM_DASH) return EM_DASH;
  return text;
}

function resolveBuilderIdentity(input = {}) {
  const groupBuilderName = cleanString(input.groupBuilderName);
  const groupBuilderSlug = cleanString(input.groupBuilderSlug);
  const profileBuilderName = cleanString(input.profileBuilderName);
  const profileBuilderSlug = cleanString(input.profileBuilderSlug);
  const profileLogoUrl = cleanString(input.profileLogoUrl);
  const bicBuilderName = cleanString(input.bicBuilderName);
  const bicBuilderSlug = cleanString(input.bicBuilderSlug);
  const bicLogoUrl = cleanString(input.bicLogoUrl);
  const unknownBuilderName = cleanString(input.unknownBuilderName) || "Unknown builder";

  return {
    name: profileBuilderName || bicBuilderName || groupBuilderName || unknownBuilderName,
    slug: profileBuilderSlug || bicBuilderSlug || groupBuilderSlug || null,
    logoUrl: profileLogoUrl || bicLogoUrl || null,
  };
}

function buildBuilderSourcesFromBic(input = {}) {
  const bicDocs = Array.isArray(input.bicDocs) ? input.bicDocs : [];
  const homes = Array.isArray(input.homes) ? input.homes : [];
  const homesByCompanyId = new Map();

  homes.forEach((home) => {
    const companyId =
      cleanString(home && home.keepupBuilderId) ||
      cleanString(home && home.companyId);
    if (!companyId) return;
    if (!homesByCompanyId.has(companyId)) {
      homesByCompanyId.set(companyId, []);
    }
    homesByCompanyId.get(companyId).push(home);
  });

  const rows = [];
  const seenBuilderIds = new Set();
  bicDocs.forEach((doc, index) => {
    const companyId = cleanString(doc && doc.companyId);
    const builderSlug = cleanString(doc && doc.builder && doc.builder.slug);
    const fallbackId = cleanString(doc && doc.id) || builderSlug || `bic-${index + 1}`;
    const builderId = companyId || fallbackId;
    if (!builderId || seenBuilderIds.has(builderId)) return;
    seenBuilderIds.add(builderId);

    rows.push({
      builderId,
      companyId: companyId || null,
      builderName: cleanString(doc && doc.builder && doc.builder.name) || null,
      builderSlug: builderSlug || null,
      bicDoc: doc,
      sourceHomes: companyId ? homesByCompanyId.get(companyId) || [] : [],
    });
  });

  return rows;
}

module.exports = {
  buildBuilderSourcesFromBic,
  displayValue,
  resolveBuilderIdentity,
};
