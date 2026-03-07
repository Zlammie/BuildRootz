const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildExpandedStorageKey,
  buildTabStorageKey,
  normalizeTab,
} = require("./communityBuilderState");

test("builder storage keys are stable and namespaced", () => {
  assert.equal(
    buildExpandedStorageKey("community-123", "builder-abc"),
    "brz:community:community-123:builder:builder-abc:expanded",
  );
  assert.equal(
    buildTabStorageKey("community-123", "builder-abc"),
    "brz:community:community-123:builder:builder-abc:tab",
  );
});

test("builder storage keys handle missing ids", () => {
  assert.equal(buildExpandedStorageKey("", ""), "brz:community:unknown:builder:unknown:expanded");
  assert.equal(buildTabStorageKey(null, undefined), "brz:community:unknown:builder:unknown:tab");
});

test("normalizeTab defaults safely to plans", () => {
  assert.equal(normalizeTab("inventory"), "inventory");
  assert.equal(normalizeTab("plans"), "plans");
  assert.equal(normalizeTab("other"), "plans");
  assert.equal(normalizeTab(""), "plans");
});
