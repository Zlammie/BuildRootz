function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function firstString(...values) {
  for (const value of values) {
    const found = cleanString(value);
    if (found !== null) return found;
  }
  return null;
}

function parseNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(/[$,\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const found = parseNumber(value);
    if (found !== null) return found;
  }
  return null;
}

function parseAmount(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("%")) return trimmed;
  const numeric = Number(trimmed.replace(/[$,\s]/g, ""));
  if (Number.isFinite(numeric)) return numeric;
  return trimmed;
}

function firstAmount(...values) {
  for (const value of values) {
    const found = parseAmount(value);
    if (found !== null) return found;
  }
  return null;
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "y", "on", "enabled"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off", "disabled"].includes(normalized)) return false;
  return null;
}

function firstBoolean(...values) {
  for (const value of values) {
    const found = parseBoolean(value);
    if (found !== null) return found;
  }
  return null;
}

function hasAnyValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasAnyValue(item));
  if (typeof value === "object") {
    return Object.values(value).some((item) => hasAnyValue(item));
  }
  return false;
}

const COMMUNITY_DETAILS_SOURCE_KEYS = [
  "communityDetails",
  "primaryContact",
  "salesContact",
  "contact",
  "totalLots",
  "lotsTotal",
  "lotCount",
  "schools",
  "schoolDistrict",
  "fees",
  "hoaMonthly",
  "hoaAmount",
  "hoaFrequency",
  "taxRate",
  "taxDistrict",
  "hoaIncludes",
  "earnestMoney",
  "earnestAmount",
  "realtorIncentives",
  "realtorAmount",
  "realtorCommission",
  "realtorBonus",
  "realtorOptIn",
  "pidMud",
  "pid",
  "mud",
  "hasPid",
  "hasMud",
  "pidMudNotes",
];

function hasCommunityDetailsInput(source) {
  const src = asObject(source);
  if (!src) return false;
  return COMMUNITY_DETAILS_SOURCE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(src, key));
}

function normalizeSchools(detailsSchools, sourceSchools, source) {
  const detailsObj = asObject(detailsSchools);
  const sourceObj = asObject(sourceSchools);
  const district = firstString(
    detailsObj?.district,
    detailsObj?.isd,
    sourceObj?.district,
    sourceObj?.isd,
    source.schoolDistrict,
    source.district,
    source.isd,
  );
  const elementary = firstString(
    detailsObj?.elementary,
    sourceObj?.elementary,
    source.elementarySchool,
    source.elementary,
  );
  const middle = firstString(
    detailsObj?.middle,
    sourceObj?.middle,
    source.middleSchool,
    source.middle,
  );
  const high = firstString(
    detailsObj?.high,
    sourceObj?.high,
    source.highSchool,
    source.high,
  );
  const text = firstString(
    detailsObj?.text,
    typeof detailsSchools === "string" ? detailsSchools : null,
    sourceObj?.text,
    typeof sourceSchools === "string" ? sourceSchools : null,
    source.schoolsText,
  );

  return {
    district,
    elementary,
    middle,
    high,
    text,
  };
}

function normalizeCommunityDetails(sourceInput) {
  const source = asObject(sourceInput) || {};
  const details = asObject(source.communityDetails) || {};
  const sourcePrimary = asObject(source.primaryContact);
  const detailsPrimary = asObject(details.primaryContact);
  const sourceSales = asObject(source.salesContact);
  const sourceContact = asObject(source.contact);
  const sourceFees = asObject(source.fees);

  const primaryContact = {
    name: firstString(
      detailsPrimary?.name,
      sourcePrimary?.name,
      sourceSales?.name,
      sourceContact?.name,
      source.primaryContactName,
      source.contactName,
    ),
    role: firstString(
      detailsPrimary?.role,
      detailsPrimary?.title,
      sourcePrimary?.role,
      sourcePrimary?.title,
      sourceSales?.role,
      sourceSales?.title,
      sourceContact?.role,
      source.primaryContactRole,
      source.contactRole,
    ),
    phone: firstString(
      detailsPrimary?.phone,
      sourcePrimary?.phone,
      sourceSales?.phone,
      sourceContact?.phone,
      source.primaryContactPhone,
      source.contactPhone,
    ),
    email: firstString(
      detailsPrimary?.email,
      sourcePrimary?.email,
      sourceSales?.email,
      sourceContact?.email,
      source.primaryContactEmail,
      source.contactEmail,
    ),
  };

  const schools = normalizeSchools(details.schools, source.schools, source);
  const hoaAmount = firstAmount(
    details.hoaAmount,
    source.hoaAmount,
    source.hoa,
    source.hoaFees,
    source.hoaDues,
    sourceFees?.hoaFee,
  );
  const hoaFrequency = firstString(
    details.hoaFrequency,
    details.hoaPeriod,
    source.hoaFrequency,
    source.hoaPeriod,
    sourceFees?.hoaFrequency,
  );
  const earnestMoney = firstAmount(
    details.earnestMoney,
    source.earnestMoney,
    source.earnestAmount,
    source.earnestDeposit,
  );

  const sourceRealtor = asObject(source.realtorIncentives) || {};
  const detailsRealtor = asObject(details.realtorIncentives) || {};
  const realtorEnabled =
    firstBoolean(
      detailsRealtor.enabled,
      detailsRealtor.optIn,
      sourceRealtor.enabled,
      sourceRealtor.optIn,
      source.realtorIncentivesEnabled,
      source.realtorOptIn,
      source.showRealtorIncentives,
    ) ?? false;
  const realtorAmount = firstAmount(
    detailsRealtor.amount,
    detailsRealtor.commission,
    detailsRealtor.bonus,
    sourceRealtor.amount,
    sourceRealtor.commission,
    sourceRealtor.bonus,
    source.realtorAmount,
    source.realtorCommission,
    source.realtorBonus,
  );
  const realtorNotes = firstString(
    detailsRealtor.notes,
    sourceRealtor.notes,
    source.realtorIncentivesNotes,
    source.realtorNotes,
  );

  const sourcePidMud = asObject(source.pidMud) || {};
  const detailsPidMud = asObject(details.pidMud) || {};
  let hasPid = firstBoolean(
    detailsPidMud.hasPid,
    detailsPidMud.pid,
    sourcePidMud.hasPid,
    sourcePidMud.pid,
    source.hasPid,
    source.pid,
  );
  let hasMud = firstBoolean(
    detailsPidMud.hasMud,
    detailsPidMud.mud,
    sourcePidMud.hasMud,
    sourcePidMud.mud,
    source.hasMud,
    source.mud,
  );
  const pidFeeValue = firstNumber(sourceFees?.pidFee, source.pidFee);
  const mudFeeValue = firstNumber(sourceFees?.mudFee, source.mudFee);
  if (hasPid === null && pidFeeValue !== null) {
    hasPid = pidFeeValue > 0;
  }
  if (hasMud === null && mudFeeValue !== null) {
    hasMud = mudFeeValue > 0;
  }
  const pidMudNotes = firstString(
    detailsPidMud.notes,
    sourcePidMud.notes,
    source.pidMudNotes,
    source.pidNotes,
    source.mudNotes,
    source.taxDistrictNotes,
  );

  return {
    primaryContact,
    totalLots: firstNumber(
      details.totalLots,
      source.totalLots,
      source.lotsTotal,
      source.lotCount,
      asObject(source.lots)?.total,
    ),
    schools,
    hoaAmount,
    hoaFrequency,
    earnestMoney,
    realtorIncentives: {
      enabled: realtorEnabled,
      amount: realtorAmount,
      notes: realtorNotes,
    },
    pidMud: {
      hasPid,
      hasMud,
      notes: pidMudNotes,
    },
  };
}

function hasMeaningfulCommunityDetails(details) {
  return hasAnyValue(details);
}

function withCommunityDetails(baseCommunity, source) {
  return {
    ...(asObject(baseCommunity) || {}),
    communityDetails: normalizeCommunityDetails(source || baseCommunity || {}),
  };
}

module.exports = {
  normalizeCommunityDetails,
  hasCommunityDetailsInput,
  hasMeaningfulCommunityDetails,
  withCommunityDetails,
};
