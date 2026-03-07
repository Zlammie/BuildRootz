function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function parseLocationFromFormattedAddress(formattedAddress) {
  const normalized = cleanText(formattedAddress);
  if (!normalized) return "";

  const parts = normalized
    .split(",")
    .map((part) => cleanText(part))
    .filter(Boolean);

  if (parts.length >= 3) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  }
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }
  return normalized;
}

function buildListingLocationLine({
  city,
  state,
  postalCode,
  formattedAddress,
  fallbackLabel = "Location coming soon",
} = {}) {
  const cleanCity = cleanText(city);
  const cleanState = cleanText(state);
  const cleanPostalCode = cleanText(postalCode);

  if (cleanCity || cleanState || cleanPostalCode) {
    const stateZip = [cleanState, cleanPostalCode].filter(Boolean).join(" ");
    return [cleanCity, stateZip].filter(Boolean).join(", ");
  }

  const parsedFromFormatted = parseLocationFromFormattedAddress(formattedAddress);
  if (parsedFromFormatted) return parsedFromFormatted;

  return fallbackLabel;
}

module.exports = {
  buildListingLocationLine,
  parseLocationFromFormattedAddress,
};
