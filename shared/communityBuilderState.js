function cleanPart(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildExpandedStorageKey(communityId, builderId) {
  const community = cleanPart(communityId) || "unknown";
  const builder = cleanPart(builderId) || "unknown";
  return `brz:community:${community}:builder:${builder}:expanded`;
}

function buildTabStorageKey(communityId, builderId) {
  const community = cleanPart(communityId) || "unknown";
  const builder = cleanPart(builderId) || "unknown";
  return `brz:community:${community}:builder:${builder}:tab`;
}

function normalizeTab(value) {
  return value === "inventory" ? "inventory" : "plans";
}

module.exports = {
  buildExpandedStorageKey,
  buildTabStorageKey,
  normalizeTab,
};
