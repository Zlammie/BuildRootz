const {
  normalizePromo,
} = require("./promo");

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function hasAnyValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some((item) => hasAnyValue(item));
  if (typeof value === "object") {
    return Object.values(value).some((item) => hasAnyValue(item));
  }
  return false;
}

function normalizeCadence(value) {
  const normalized = cleanString(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("month")) return "monthly";
  if (normalized.includes("year") || normalized.includes("annual")) return "annual";
  return normalized;
}

function deriveHoaMonthlyFromWebData(hoaInput) {
  const hoa = asObject(hoaInput);
  const amount = toNumber(hoa.amount);
  if (amount === null || amount < 0) return null;
  const cadence = normalizeCadence(hoa.cadence || hoa.frequency || hoa.period);
  if (cadence === "annual") {
    return amount / 12;
  }
  return amount;
}

function formatPercentFromDecimal(value) {
  const numeric = toNumber(value);
  if (numeric === null) return null;
  const percent = Number((numeric * 100).toFixed(2));
  return `${percent}%`;
}

function normalizeCommunityAmenitiesForRender(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  input.forEach((item) => {
    const label =
      cleanString(typeof item === "string" ? item : asObject(item).label);
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label });
  });
  return out;
}

function amenityLabels(input) {
  return normalizeCommunityAmenitiesForRender(input)
    .map((item) => item.label)
    .filter(Boolean);
}

function normalizeCommunityProductTypesForRender(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  input.forEach((item) => {
    const label =
      cleanString(typeof item === "string" ? item : asObject(item).label);
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label });
  });
  return out;
}

function productTypeLabels(input) {
  return normalizeCommunityProductTypesForRender(input)
    .map((item) => item.label)
    .filter(Boolean);
}

function mergeContact(existingInput, webDataInput) {
  const existing = asObject(existingInput);
  const webData = asObject(webDataInput);
  const rawContact = asObject(webData.primaryContact);
  const visibility = asObject(webData.contactVisibility);
  if (!hasAnyValue(rawContact) && !hasAnyValue(visibility)) {
    return hasAnyValue(existing) ? existing : null;
  }
  const merged = {
    name: cleanString(rawContact.name) || cleanString(existing.name),
    phone: cleanString(rawContact.phone) || cleanString(existing.phone),
    email: cleanString(rawContact.email) || cleanString(existing.email),
  };

  if (visibility.showName === false) merged.name = null;
  if (visibility.showPhone === false) merged.phone = null;
  if (visibility.showEmail !== true) merged.email = null;

  return hasAnyValue(merged) ? merged : null;
}

function mergeSchools(existingInput, webDataInput) {
  const existing = asObject(existingInput);
  const webData = asObject(webDataInput);
  const rawSchools = asObject(webData.schools);
  const schools = {
    isd:
      cleanString(rawSchools.isd) ||
      cleanString(rawSchools.district) ||
      cleanString(existing.isd) ||
      cleanString(existing.district),
    elementary:
      cleanString(rawSchools.elementary) || cleanString(existing.elementary),
    middle:
      cleanString(rawSchools.middle) || cleanString(existing.middle),
    high:
      cleanString(rawSchools.high) || cleanString(existing.high),
  };
  return hasAnyValue(schools) ? schools : null;
}

function mergeBuilderInCommunityIntoPublicCommunity(communityInput, bicInput) {
  const community = asObject(communityInput);
  const bic = asObject(bicInput);
  const webData = asObject(bic.webData);
  const existingDetails = asObject(community.communityDetails);
  const existingPidMud = asObject(existingDetails.pidMud);
  const existingTopLevelContact = asObject(community.primaryContact);
  const existingTopLevelSchools = asObject(community.schools);

  const mergedPrimaryContact =
    mergeContact(
      Object.keys(existingTopLevelContact).length
        ? existingTopLevelContact
        : existingDetails.primaryContact,
      webData,
    ) || null;
  const mergedSchools =
    mergeSchools(
      Object.keys(existingTopLevelSchools).length
        ? existingTopLevelSchools
        : existingDetails.schools,
      webData,
    ) || null;

  const hoaMonthly =
    deriveHoaMonthlyFromWebData(webData.hoa) ??
    (typeof community.hoaMonthly === "number" ? community.hoaMonthly : null);
  const taxRate =
    toNumber(webData.taxRate) ??
    (typeof community.taxRate === "number" ? community.taxRate : null);
  const mudTaxRate =
    toNumber(webData.mudTaxRate) ??
    (typeof community.mudTaxRate === "number" ? community.mudTaxRate : null);
  const mudFeeAmount =
    toNumber(webData.mudFeeAmount) ??
    (typeof community.mudFeeAmount === "number" ? community.mudFeeAmount : null);
  const pidFee =
    toNumber(webData.pidFeeAmount) ??
    (typeof community.pidFee === "number" ? community.pidFee : null);
  const pidFeeFrequency =
    cleanString(webData.pidFeeFrequency) ||
    cleanString(community.pidFeeFrequency) ||
    null;
  const pid =
    toBoolean(webData.hasPID) ??
    (typeof community.pid === "boolean" ? community.pid : null);
  const mud =
    toBoolean(webData.hasMUD) ??
    (typeof community.mud === "boolean" ? community.mud : null);
  const taxDistrict =
    cleanString(webData.taxDistrict) ||
    cleanString(community.taxDistrict) ||
    null;
  const rawHoaIncludes = Array.isArray(webData.hoaIncludes)
    ? webData.hoaIncludes
    : Array.isArray(community.hoaIncludes)
      ? community.hoaIncludes
      : [];
  const hoaIncludes = rawHoaIncludes
    .map((item) => cleanString(item))
    .filter(Boolean);
  const webDataAmenities = amenityLabels(
    webData.amenities !== undefined ? webData.amenities : webData.ammenities,
  );
  const mergedAmenities = webDataAmenities.length
    ? webDataAmenities
    : amenityLabels(community.amenities);
  const webDataProductTypes = productTypeLabels(webData.productTypes);
  const mergedProductTypes = webDataProductTypes.length
    ? webDataProductTypes
    : productTypeLabels(community.productTypes);
  const mergedPromo =
    normalizePromo(
      webData.promo !== undefined ? webData.promo : webData.promotion,
    ) ||
    normalizePromo(community.promo) ||
    normalizePromo(community.promotion);

  const mergedCommunityDetails = {
    ...existingDetails,
    ...(mergedPrimaryContact ? { primaryContact: mergedPrimaryContact } : {}),
    ...(mergedSchools
      ? {
          schools: {
            ...asObject(existingDetails.schools),
            district: mergedSchools.isd,
            elementary: mergedSchools.elementary,
            middle: mergedSchools.middle,
            high: mergedSchools.high,
          },
        }
      : {}),
    ...(webData.hoa && typeof webData.hoa === "object"
      ? {
          hoaAmount:
            toNumber(asObject(webData.hoa).amount) ?? existingDetails.hoaAmount ?? null,
          hoaFrequency:
            cleanString(asObject(webData.hoa).cadence) ||
            cleanString(asObject(webData.hoa).frequency) ||
            existingDetails.hoaFrequency ||
            null,
        }
      : {}),
    pidMud: {
      ...existingPidMud,
      ...(pid !== null ? { hasPid: pid } : {}),
      ...(mud !== null ? { hasMud: mud } : {}),
    },
  };

  const merged = {
    ...community,
    ...(mergedPrimaryContact ? { primaryContact: mergedPrimaryContact } : {}),
    ...(mergedSchools ? { schools: mergedSchools } : {}),
    ...(hoaMonthly !== null ? { hoaMonthly } : {}),
    ...(taxRate !== null ? { taxRate } : {}),
    ...(mudTaxRate !== null ? { mudTaxRate } : {}),
    ...(mudFeeAmount !== null ? { mudFeeAmount } : {}),
    ...(pidFee !== null ? { pidFee } : {}),
    ...(pidFeeFrequency !== null ? { pidFeeFrequency } : {}),
    ...(pid !== null ? { pid } : {}),
    ...(mud !== null ? { mud } : {}),
    ...(taxDistrict !== null ? { taxDistrict } : {}),
    ...(hoaIncludes.length ? { hoaIncludes } : {}),
    ...(mergedAmenities.length ? { amenities: mergedAmenities } : {}),
    ...(mergedProductTypes.length ? { productTypes: mergedProductTypes } : {}),
    ...(mergedPromo ? { promo: mergedPromo } : {}),
    ...(hasAnyValue(mergedCommunityDetails) ? { communityDetails: mergedCommunityDetails } : {}),
  };

  return merged;
}

module.exports = {
  deriveHoaMonthlyFromWebData,
  formatPercentFromDecimal,
  normalizeCommunityAmenitiesForRender,
  normalizeCommunityProductTypesForRender,
  mergeBuilderInCommunityIntoPublicCommunity,
};
