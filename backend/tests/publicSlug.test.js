const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizePublicSlug } = require("../../shared/publicSlug");

test("normalizePublicSlug canonicalizes mixed case, spaces, and separators", () => {
  assert.equal(normalizePublicSlug("  My__Mixed -- Slug  "), "my-mixed-slug");
  assert.equal(normalizePublicSlug("A/B\\C|D"), "a-b-c-d");
  assert.equal(normalizePublicSlug("already-clean"), "already-clean");
});

test("normalizePublicSlug handles nullish and repeated separators", () => {
  assert.equal(normalizePublicSlug(undefined), "");
  assert.equal(normalizePublicSlug(null), "");
  assert.equal(normalizePublicSlug(" --___--- "), "");
  assert.equal(normalizePublicSlug("plan---name___v2"), "plan-name-v2");
});
