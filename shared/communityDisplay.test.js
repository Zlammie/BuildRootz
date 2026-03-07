const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBuilderSourcesFromBic,
  displayValue,
  resolveBuilderIdentity,
} = require("./communityDisplay");

const EM_DASH = "\u2014";

test("displayValue normalizes empty and mojibake placeholders", () => {
  assert.equal(displayValue(null), EM_DASH);
  assert.equal(displayValue(undefined), EM_DASH);
  assert.equal(displayValue(""), EM_DASH);
  assert.equal(displayValue("\u00E2\u20AC\u201D"), EM_DASH);
  assert.equal(displayValue("\u00C3\u00A2\u00E2\u201A\u00AC\u00E2\u20AC\u009D"), EM_DASH);
  assert.equal(displayValue("  42  "), "42");
});

test("resolveBuilderIdentity prefers profile over bic over group", () => {
  const identity = resolveBuilderIdentity({
    groupBuilderName: "Group Name",
    groupBuilderSlug: "group-slug",
    profileBuilderName: "Profile Name",
    profileBuilderSlug: "profile-slug",
    profileLogoUrl: "https://example.com/profile-logo.png",
    bicBuilderName: "Bic Name",
    bicBuilderSlug: "bic-slug",
    bicLogoUrl: "https://example.com/bic-logo.png",
  });

  assert.equal(identity.name, "Profile Name");
  assert.equal(identity.slug, "profile-slug");
  assert.equal(identity.logoUrl, "https://example.com/profile-logo.png");
});

test("resolveBuilderIdentity falls back to Unknown builder when identity is missing", () => {
  const identity = resolveBuilderIdentity({
    groupBuilderName: "",
    bicBuilderName: "",
    profileBuilderName: "",
  });

  assert.equal(identity.name, "Unknown builder");
  assert.equal(identity.slug, null);
  assert.equal(identity.logoUrl, null);
});

test("buildBuilderSourcesFromBic creates cards only from BuilderInCommunity rows", () => {
  const bicDocs = [
    {
      id: "bic-1",
      companyId: "builder-a",
      builder: { name: "Alpha Homes", slug: "alpha-homes" },
    },
    {
      id: "bic-2",
      companyId: "builder-b",
      builder: { name: "Bravo Builders", slug: "bravo-builders" },
    },
  ];

  const homes = [
    { id: "h-1", keepupBuilderId: "builder-a", builder: "Alpha Homes" },
    { id: "h-2", companyId: "builder-b", builder: "Bravo Builders" },
    { id: "h-3", builder: "Ghost Builder Name" },
    { id: "h-4", builder: "Another Missing Builder" },
  ];

  const rows = buildBuilderSourcesFromBic({ bicDocs, homes });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.builderId), ["builder-a", "builder-b"]);
  assert.deepEqual(rows.map((row) => row.builderName), ["Alpha Homes", "Bravo Builders"]);
  assert.equal(rows[0].sourceHomes.length, 1);
  assert.equal(rows[1].sourceHomes.length, 1);
  assert.equal(rows.some((row) => /Builder\s+\d+/i.test(row.builderName || "")), false);
});
