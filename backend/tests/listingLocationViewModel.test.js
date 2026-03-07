const test = require("node:test");
const assert = require("node:assert/strict");

const { buildListingLocationLine } = require("../../shared/listingLocation");

test("view model uses split location fields when present", () => {
  const line = buildListingLocationLine({
    city: "Frisco",
    state: "TX",
    postalCode: "75034",
    formattedAddress: "2204 Lake View Dr, Frisco, TX 75034",
  });

  assert.equal(line, "Frisco, TX 75034");
});

test("view model falls back to formattedAddress when split fields are missing", () => {
  const line = buildListingLocationLine({
    city: "",
    state: "",
    postalCode: "",
    formattedAddress: "2204 Lake View Dr, Frisco, TX 75034",
  });

  assert.equal(line, "Frisco, TX 75034");
});

test("view model returns default label when no location data is present", () => {
  const line = buildListingLocationLine({
    city: "",
    state: "",
    postalCode: "",
    formattedAddress: "",
  });

  assert.equal(line, "Location coming soon");
});
