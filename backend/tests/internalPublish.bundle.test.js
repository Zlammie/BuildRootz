const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const router = require("../routes/internalPublish.routes");
const BuilderInCommunity = require("../models/BuilderInCommunity");
const PlanCatalog = require("../models/PlanCatalog");
const CommunityPlanOffering = require("../models/CommunityPlanOffering");
const PublicHome = require("../models/PublicHome");

const INTERNAL_KEY = "test-internal-key";

let mongoServer;
let server;
let baseUrl;

function oid() {
  return new mongoose.Types.ObjectId();
}

function nowIso() {
  return new Date().toISOString();
}

async function postBundle(payload, token = INTERNAL_KEY) {
  const response = await fetch(`${baseUrl}/internal/publish/keepup/bundle`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

function findWarningByCode(warnings, code) {
  if (!Array.isArray(warnings)) return null;
  return warnings.find((warning) => warning && typeof warning === "object" && warning.code === code) || null;
}

async function findKeepupHome(stableId) {
  return PublicHome.findOne({ stableId }).lean();
}

async function findPublicCommunity(id) {
  return mongoose.connection.db.collection("PublicCommunity").findOne({
    _id: new mongoose.Types.ObjectId(id),
  });
}

async function insertPublicCommunity(id, name = "Test Community") {
  await mongoose.connection.db.collection("PublicCommunity").insertOne({
    _id: new mongoose.Types.ObjectId(id),
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
  });
}

test.before(async () => {
  process.env.BRZ_INTERNAL_API_KEY = INTERNAL_KEY;
  process.env.KEEPUP_PUBLIC_BASE_URL = "https://keepup.test";
  process.env.NODE_ENV = "test";

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: "BuildRootz" });

  const app = express();
  app.use(express.json());
  app.use("/internal/publish/keepup", router);

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

test("planCatalog upserts by companyId + keepupFloorPlanId and keeps patch semantics", async () => {
  const companyId = oid().toHexString();
  const floorPlanId = "fp-100";

  const createPayload = {
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planCatalog: [
      {
        companyId,
        keepupFloorPlanId: floorPlanId,
        name: "The Briar",
        description: "Full description",
        beds: 3,
        baths: 2.5,
        sqft: 1850,
        asset: {
          fileUrl: "/uploads/floorplans/the-briar.pdf",
          previewUrl: "/uploads/floorplans/the-briar-preview.jpg",
          originalFilename: "the-briar.pdf",
          mimeType: "application/pdf",
        },
      },
    ],
  };

  const created = await postBundle(createPayload);
  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.counts.planCatalogUpserted, 1);

  const createdDoc = await PlanCatalog.findOne({ companyId, keepupFloorPlanId: floorPlanId }).lean();
  assert.ok(createdDoc);
  assert.deepEqual(createdDoc.asset, {
    fileUrl: "/uploads/floorplans/the-briar.pdf",
    previewUrl: "/uploads/floorplans/the-briar-preview.jpg",
    originalFilename: "the-briar.pdf",
    mimeType: "application/pdf",
  });

  const updatePayload = {
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planCatalog: [
      {
        companyId,
        keepupFloorPlanId: floorPlanId,
        beds: 4,
      },
    ],
  };

  const updated = await postBundle(updatePayload);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.ok, true);
  assert.equal(updated.body.counts.planCatalogUpserted, 1);

  const docs = await PlanCatalog.find({ companyId, keepupFloorPlanId: floorPlanId }).lean();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].name, "The Briar");
  assert.equal(docs[0].description, "Full description");
  assert.equal(docs[0].beds, 4);
  assert.deepEqual(docs[0].asset, {
    fileUrl: "/uploads/floorplans/the-briar.pdf",
    previewUrl: "/uploads/floorplans/the-briar-preview.jpg",
    originalFilename: "the-briar.pdf",
    mimeType: "application/pdf",
  });
});

test("communities payload upserts overview and media onto PublicCommunity without clearing omitted fields", async () => {
  const publicCommunityId = oid().toHexString();

  const created = await postBundle({
    meta: { requestedAt: nowIso(), publisherVersion: "keepup-test" },
    communities: [
      {
        publicCommunityId,
        name: "Red Oak Ranch",
        city: "Celina",
        state: "TX",
        overview: "Controlled community overview.",
        highlights: ["Trail system", "Resort pool", "Trail system"],
        heroImageUrl: "/uploads/communities/red-oak-ranch-hero.jpg",
        imageUrls: [
          "/uploads/communities/red-oak-ranch-hero.jpg",
          "uploads/communities/red-oak-ranch-entry.jpg",
          "https://cdn.test/communities/red-oak-ranch-clubhouse.jpg",
          "/uploads/communities/red-oak-ranch-entry.jpg",
        ],
        hoaMonthly: 125,
        taxRate: 0.0215,
        pid: true,
        mud: false,
        fees: {
          taxDistrict: "PID District A",
          hoaIncludes: ["Front yard maintenance", "Internet", "Internet"],
        },
      },
    ],
  });

  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.counts.publicCommunitiesUpserted, 1);

  const stored = await findPublicCommunity(publicCommunityId);
  assert.equal(stored.name, "Red Oak Ranch");
  assert.equal(stored.overview, "Controlled community overview.");
  assert.deepEqual(stored.highlights, ["Trail system", "Resort pool"]);
  assert.equal(
    stored.heroImageUrl,
    "https://keepup.test/uploads/communities/red-oak-ranch-hero.jpg",
  );
  assert.deepEqual(stored.imageUrls, [
    "https://keepup.test/uploads/communities/red-oak-ranch-hero.jpg",
    "https://keepup.test/uploads/communities/red-oak-ranch-entry.jpg",
    "https://cdn.test/communities/red-oak-ranch-clubhouse.jpg",
  ]);
  assert.equal(stored.hoaMonthly, 125);
  assert.equal(stored.taxRate, 0.0215);
  assert.equal(stored.pid, true);
  assert.equal(stored.mud, false);
  assert.equal(stored.taxDistrict, "PID District A");
  assert.deepEqual(stored.hoaIncludes, ["Front yard maintenance", "Internet"]);
  assert.equal(stored.mapImage, stored.heroImageUrl);
  assert.deepEqual(stored.images, stored.imageUrls);

  const updated = await postBundle({
    meta: { requestedAt: nowIso(), publisherVersion: "keepup-test" },
    communities: [
      {
        publicCommunityId,
        name: "Red Oak Ranch",
      },
    ],
  });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.ok, true);

  const preserved = await findPublicCommunity(publicCommunityId);
  assert.equal(preserved.overview, "Controlled community overview.");
  assert.deepEqual(preserved.highlights, ["Trail system", "Resort pool"]);
  assert.equal(
    preserved.heroImageUrl,
    "https://keepup.test/uploads/communities/red-oak-ranch-hero.jpg",
  );
  assert.equal(preserved.hoaMonthly, 125);
  assert.equal(preserved.taxRate, 0.0215);
  assert.equal(preserved.pid, true);
  assert.equal(preserved.mud, false);
  assert.equal(preserved.taxDistrict, "PID District A");
  assert.deepEqual(preserved.hoaIncludes, ["Front yard maintenance", "Internet"]);
});

test("builderInCommunities webData fee fields sync onto PublicCommunity without wiping on omission", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();

  await insertPublicCommunity(publicCommunityId, "Tax Test");

  const created = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    builderInCommunities: [
      {
        companyId,
        publicCommunityId,
        webData: {
          amenities: [
            { label: "Pool" },
            { label: "Walking Trails" },
            { label: "pool" },
            { label: " " },
          ],
          productTypes: [
            { label: "22' Townhomes" },
            { label: "45' Homesites" },
            { label: "22' townhomes" },
          ],
          promo: {
            headline: "Community closing-cost credit",
            description: "Limited-time incentive for early buyers.",
            disclaimer: "Terms apply.",
          },
          hoa: {
            amount: 2400,
            cadence: "annual",
          },
          taxRate: 2.15,
          mudTaxRate: 0.0078,
          hasPID: true,
          hasMUD: false,
          pidFeeAmount: 1350,
          pidFeeFrequency: "annual",
          mudFeeAmount: 925,
        },
      },
    ],
  });

  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.counts.builderInCommunityUpserted, 1);

  const storedBic = await BuilderInCommunity.findOne({ companyId, publicCommunityId }).lean();
  assert.ok(storedBic);
  assert.deepEqual(storedBic.webData?.amenities, [
    { label: "Pool" },
    { label: "Walking Trails" },
  ]);
  assert.deepEqual(storedBic.webData?.productTypes, [
    { label: "22' Townhomes" },
    { label: "45' Homesites" },
  ]);
  assert.deepEqual(storedBic.webData?.promo, {
    headline: "Community closing-cost credit",
    description: "Limited-time incentive for early buyers.",
    disclaimer: "Terms apply.",
  });
  assert.equal(storedBic.webData?.mudTaxRate, 0.0078);
  assert.equal(storedBic.webData?.mudFeeAmount, 925);

  const stored = await findPublicCommunity(publicCommunityId);
  assert.equal(stored.hoaMonthly, 200);
  assert.equal(stored.taxRate, 2.15);
  assert.equal(stored.mudTaxRate, 0.0078);
  assert.equal(stored.mudFeeAmount, 925);
  assert.equal(stored.pid, true);
  assert.equal(stored.mud, false);
  assert.deepEqual(stored.amenities, [
    { label: "Pool" },
    { label: "Walking Trails" },
  ]);
  assert.deepEqual(stored.productTypes, [
    { label: "22' Townhomes" },
    { label: "45' Homesites" },
  ]);
  assert.deepEqual(stored.promo, {
    headline: "Community closing-cost credit",
    description: "Limited-time incentive for early buyers.",
    disclaimer: "Terms apply.",
  });
  assert.equal(stored.fees?.hoaFee, 200);
  assert.equal(stored.fees?.hoaFrequency, "monthly");
  assert.equal(stored.fees?.tax, 2.15);
  assert.equal(stored.fees?.taxRate, 2.15);
  assert.equal(stored.fees?.mudTaxRate, 0.0078);
  assert.equal(stored.fees?.pidFee, 1350);
  assert.equal(stored.fees?.pidFeeFrequency, "annual");
  assert.equal(stored.fees?.mudFee, 925);

  const updated = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    builderInCommunities: [
      {
        companyId,
        publicCommunityId,
        webData: {
          primaryContact: {
            name: "Jane Doe",
          },
        },
      },
    ],
  });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.ok, true);

  const preserved = await findPublicCommunity(publicCommunityId);
  assert.equal(preserved.hoaMonthly, 200);
  assert.equal(preserved.taxRate, 2.15);
  assert.equal(preserved.mudTaxRate, 0.0078);
  assert.equal(preserved.mudFeeAmount, 925);
  assert.equal(preserved.pid, true);
  assert.equal(preserved.mud, false);
  assert.deepEqual(preserved.amenities, [
    { label: "Pool" },
    { label: "Walking Trails" },
  ]);
  assert.deepEqual(preserved.productTypes, [
    { label: "22' Townhomes" },
    { label: "45' Homesites" },
  ]);
  assert.deepEqual(preserved.promo, {
    headline: "Community closing-cost credit",
    description: "Limited-time incentive for early buyers.",
    disclaimer: "Terms apply.",
  });
  assert.equal(preserved.fees?.tax, 2.15);
  assert.equal(preserved.fees?.mudTaxRate, 0.0078);
  assert.equal(preserved.fees?.pidFee, 1350);
  assert.equal(preserved.fees?.pidFeeFrequency, "annual");
  assert.equal(preserved.fees?.mudFee, 925);
});

test("builderInCommunities accepts legacy ammenities alias but stores canonical amenities", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();

  await insertPublicCommunity(publicCommunityId, "Amenity Alias");

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    builderInCommunities: [
      {
        companyId,
        publicCommunityId,
        webData: {
          ammenities: [
            { label: "Clubhouse" },
            { label: "clubhouse" },
            { label: "Fitness Center" },
          ],
        },
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  const storedBic = await BuilderInCommunity.findOne({ companyId, publicCommunityId }).lean();
  assert.ok(storedBic);
  assert.deepEqual(storedBic.webData?.amenities, [
    { label: "Clubhouse" },
    { label: "Fitness Center" },
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(storedBic.webData || {}, "ammenities"), false);

  const storedCommunity = await findPublicCommunity(publicCommunityId);
  assert.deepEqual(storedCommunity.amenities, [
    { label: "Clubhouse" },
    { label: "Fitness Center" },
  ]);
});

test("planOfferings link to planCatalog and set basePriceAsOf when price changes", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  const keepupFloorPlanId = "fp-200";

  await insertPublicCommunity(publicCommunityId, "Oak Trail");

  const firstPublish = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planCatalog: [
      {
        companyId,
        keepupFloorPlanId,
        name: "Willow",
        beds: 3,
        baths: 2,
      },
    ],
    planOfferings: [
      {
        companyId,
        publicCommunityId,
        keepupFloorPlanId,
        sortOrder: 10,
        basePriceFrom: 399900,
        basePriceVisibility: "public",
      },
    ],
  });

  assert.equal(firstPublish.status, 200);
  assert.equal(firstPublish.body.ok, true);
  assert.equal(firstPublish.body.counts.planOfferingsUpserted, 1);

  const catalog = await PlanCatalog.findOne({ companyId, keepupFloorPlanId }).lean();
  assert.ok(catalog?._id);
  const createdOffering = await CommunityPlanOffering.findOne({
    companyId,
    publicCommunityId,
    planCatalogId: catalog._id,
  }).lean();
  assert.ok(createdOffering);
  assert.equal(String(createdOffering.planCatalogId), String(catalog._id));
  assert.equal(createdOffering.basePriceFrom, 399900);
  assert.ok(createdOffering.basePriceAsOf);

  const initialAsOf = createdOffering.basePriceAsOf ? new Date(createdOffering.basePriceAsOf).toISOString() : null;
  await new Promise((resolve) => setTimeout(resolve, 5));

  const secondPublish = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planOfferings: [
      {
        companyId,
        publicCommunityId,
        keepupFloorPlanId,
        sortOrder: 10,
        basePriceFrom: 419900,
        basePriceVisibility: "public",
      },
    ],
  });

  assert.equal(secondPublish.status, 200);
  assert.equal(secondPublish.body.ok, true);

  const updatedOffering = await CommunityPlanOffering.findOne({
    companyId,
    publicCommunityId,
    planCatalogId: catalog._id,
  }).lean();
  assert.ok(updatedOffering);
  assert.equal(updatedOffering.basePriceFrom, 419900);
  assert.ok(updatedOffering.basePriceAsOf);
  const updatedAsOf = updatedOffering.basePriceAsOf
    ? new Date(updatedOffering.basePriceAsOf).toISOString()
    : null;
  assert.ok(updatedAsOf);
  assert.notEqual(updatedAsOf, initialAsOf);
});

test("planOfferings update existing null basePriceFrom to numeric price", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  const keepupFloorPlanId = "fp-201";
  const nextPrice = 401990;

  await insertPublicCommunity(publicCommunityId, "Cypress Point");

  const seededCatalog = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planCatalog: [
      {
        companyId,
        keepupFloorPlanId,
        name: "Hawthorne",
      },
    ],
  });
  assert.equal(seededCatalog.status, 200);
  assert.equal(seededCatalog.body.ok, true);

  const catalog = await PlanCatalog.findOne({ companyId, keepupFloorPlanId }).lean();
  assert.ok(catalog?._id);

  await CommunityPlanOffering.create({
    companyId,
    publicCommunityId,
    planCatalogId: catalog._id,
    keepupFloorPlanId,
    basePriceFrom: null,
    basePriceVisibility: "public",
    source: "keepup",
  });

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planOfferings: [
      {
        companyId,
        publicCommunityId,
        keepupFloorPlanId,
        basePriceFrom: nextPrice,
        basePriceAsOf: nowIso(),
        basePriceVisibility: "public",
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.counts.planOfferingsUpserted, 1);

  const updated = await CommunityPlanOffering.findOne({
    companyId,
    publicCommunityId,
    planCatalogId: catalog._id,
  }).lean();

  assert.ok(updated);
  assert.equal(updated.basePriceFrom, nextPrice);
  assert.ok(updated.basePriceAsOf);
});

test("planOfferings do not overwrite existing numeric basePriceFrom with null", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  const keepupFloorPlanId = "fp-202";
  const seededPrice = 412345;

  await insertPublicCommunity(publicCommunityId, "Pecan Ridge");

  const seededCatalog = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planCatalog: [
      {
        companyId,
        keepupFloorPlanId,
        name: "Magnolia",
      },
    ],
  });
  assert.equal(seededCatalog.status, 200);

  const catalog = await PlanCatalog.findOne({ companyId, keepupFloorPlanId }).lean();
  assert.ok(catalog?._id);

  await CommunityPlanOffering.create({
    companyId,
    publicCommunityId,
    planCatalogId: catalog._id,
    keepupFloorPlanId,
    basePriceFrom: seededPrice,
    basePriceAsOf: new Date(),
    basePriceVisibility: "public",
    source: "keepup",
  });

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planOfferings: [
      {
        companyId,
        publicCommunityId,
        keepupFloorPlanId,
        basePriceFrom: null,
        basePriceVisibility: "public",
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  const updated = await CommunityPlanOffering.findOne({
    companyId,
    publicCommunityId,
    planCatalogId: catalog._id,
  }).lean();

  assert.ok(updated);
  assert.equal(updated.basePriceFrom, seededPrice);
});

test("invalid basePriceVisibility is rejected", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  const keepupFloorPlanId = "fp-300";
  await insertPublicCommunity(publicCommunityId, "Cedar Park");

  const seeded = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planCatalog: [{ companyId, keepupFloorPlanId, name: "Aspen" }],
  });
  assert.equal(seeded.status, 200);

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planOfferings: [
      {
        companyId,
        publicCommunityId,
        keepupFloorPlanId,
        basePriceFrom: 350000,
        basePriceVisibility: "gated",
      },
    ],
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.ok(
    Array.isArray(response.body.errors) &&
      response.body.errors.some((error) =>
        String(error.message || "").includes("basePriceVisibility must be one of hidden, public")),
  );
});

test("missing planCatalog references return PLAN_CATALOG_NOT_FOUND", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  await insertPublicCommunity(publicCommunityId, "River Bend");

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planOfferings: [
      {
        companyId,
        publicCommunityId,
        keepupFloorPlanId: "unknown-plan",
        basePriceFrom: 310000,
        basePriceVisibility: "public",
      },
    ],
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.ok(Array.isArray(response.body.errors));
  assert.equal(response.body.errors[0]?.code, "PLAN_CATALOG_NOT_FOUND");
  assert.ok(Array.isArray(response.body.errors[0]?.missingPlanCatalogRefs));
  assert.deepEqual(response.body.errors[0].missingPlanCatalogRefs[0], {
    companyId,
    keepupFloorPlanId: "unknown-plan",
  });
});

test("missing publicCommunityId references return PUBLIC_COMMUNITY_NOT_FOUND", async () => {
  const companyId = oid().toHexString();
  const missingCommunityId = oid().toHexString();
  const keepupFloorPlanId = "fp-404";

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planCatalog: [{ companyId, keepupFloorPlanId, name: "Elm" }],
    planOfferings: [
      {
        companyId,
        publicCommunityId: missingCommunityId,
        keepupFloorPlanId,
        basePriceFrom: 500000,
        basePriceVisibility: "public",
      },
    ],
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.ok(Array.isArray(response.body.errors));
  assert.equal(response.body.errors[0]?.code, "PUBLIC_COMMUNITY_NOT_FOUND");
  assert.ok(Array.isArray(response.body.errors[0]?.publicCommunityIds));
  assert.ok(response.body.errors[0].publicCommunityIds.includes(missingCommunityId));
});

test("publicHomes upsert idempotently by stableId and persist keepup source metadata", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  await insertPublicCommunity(publicCommunityId, "Maple Grove");

  const firstPublish = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      {
        companyId,
        publicCommunityId,
        keepupListingId: "listing-100",
        source: {
          type: "keepup",
          ingestedAt: nowIso(),
          updatedAt: nowIso(),
          updatedBy: "system",
        },
        promo: {
          headline: "Inventory rate buydown",
          description: "Special financing on this home.",
        },
        promoMode: "override",
        status: "Available",
        price: { list: 399900 },
        beds: 3,
        baths: 2.5,
        sqft: 1853,
        address1: "101 Main St",
        city: "Prosper",
        state: "TX",
        postalCode: "75078",
        formattedAddress: "101 Main St, Prosper, TX 75078",
        address: { line1: "101 Main St", city: "Prosper", state: "TX", zip: "75078" },
      },
    ],
  });
  assert.equal(firstPublish.status, 200);
  assert.equal(firstPublish.body.ok, true);
  assert.equal(firstPublish.body.counts.publicHomesUpserted, 1);

  const firstDoc = await findKeepupHome("listing-100");
  assert.ok(firstDoc);
  assert.equal(firstDoc.stableId, "listing-100");
  assert.equal(firstDoc.source?.type, "keepup");
  assert.equal(firstDoc.source?.externalId, "listing-100");
  assert.equal(firstDoc.source?.updatedBy, "system");
  assert.deepEqual(firstDoc.promo, {
    headline: "Inventory rate buydown",
    description: "Special financing on this home.",
    disclaimer: null,
  });
  assert.equal(firstDoc.promoMode, "override");
  assert.ok(firstDoc.source?.ingestedAt);
  assert.ok(firstDoc.source?.updatedAt);
  assert.equal(firstDoc.status, "Available");
  assert.equal(firstDoc.price, 399900);
  assert.equal(firstDoc.address1, "101 Main St");
  assert.equal(firstDoc.city, "Prosper");
  assert.equal(firstDoc.state, "TX");
  assert.equal(firstDoc.postalCode, "75078");
  assert.equal(firstDoc.formattedAddress, "101 Main St, Prosper, TX 75078");
  assert.ok(firstDoc.lastPublishedAt);

  const firstId = String(firstDoc._id);
  const firstPublishedAt = new Date(firstDoc.lastPublishedAt).toISOString();

  await new Promise((resolve) => setTimeout(resolve, 5));

  const secondPublish = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      {
        companyId,
        publicCommunityId,
        keepupListingId: "listing-100",
        promo: "Fresh inventory incentive",
        status: "Sold",
        price: { list: 420000 },
        address1: "",
        city: "",
        state: null,
        postalCode: "",
        formattedAddress: "",
      },
    ],
  });
  assert.equal(secondPublish.status, 200);
  assert.equal(secondPublish.body.ok, true);
  assert.equal(secondPublish.body.counts.publicHomesUpserted, 1);

  const secondDoc = await findKeepupHome("listing-100");
  assert.ok(secondDoc);
  assert.equal(String(secondDoc._id), firstId);
  assert.equal(secondDoc.status, "Sold");
  assert.equal(secondDoc.price, 420000);
  assert.equal(secondDoc.address1, "101 Main St");
  assert.equal(secondDoc.city, "Prosper");
  assert.equal(secondDoc.state, "TX");
  assert.equal(secondDoc.postalCode, "75078");
  assert.equal(secondDoc.formattedAddress, "101 Main St, Prosper, TX 75078");
  assert.deepEqual(secondDoc.promo, {
    headline: "Fresh inventory incentive",
    description: null,
    disclaimer: null,
  });
  assert.equal(secondDoc.promoMode, "override");
  assert.ok(secondDoc.lastPublishedAt);
  assert.equal(
    new Date(secondDoc.source.ingestedAt).toISOString(),
    new Date(firstDoc.source.ingestedAt).toISOString(),
  );
  assert.notEqual(new Date(secondDoc.lastPublishedAt).toISOString(), firstPublishedAt);
});

test("publicHomes persist split location fields from inventory payload", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  await insertPublicCommunity(publicCommunityId, "Split Field Estates");

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      {
        companyId,
        publicCommunityId,
        keepupListingId: "listing-split-fields",
        status: "Available",
        address1: "2204 Lake View Dr",
        city: "Frisco",
        state: "TX",
        postalCode: "75034",
        formattedAddress: "2204 Lake View Dr, Frisco, TX 75034",
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);

  const doc = await findKeepupHome("listing-split-fields");
  assert.ok(doc);
  assert.equal(doc.address1, "2204 Lake View Dr");
  assert.equal(doc.city, "Frisco");
  assert.equal(doc.state, "TX");
  assert.equal(doc.postalCode, "75034");
  assert.equal(doc.formattedAddress, "2204 Lake View Dr, Frisco, TX 75034");
  assert.equal(doc.address?.line1, "2204 Lake View Dr");
  assert.equal(doc.address?.city, "Frisco");
  assert.equal(doc.address?.state, "TX");
  assert.equal(doc.address?.zip, "75034");
});

test("publicHomes missing publicCommunityId returns PUBLIC_COMMUNITY_NOT_FOUND", async () => {
  const companyId = oid().toHexString();
  const missingCommunityId = oid().toHexString();

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      {
        companyId,
        publicCommunityId: missingCommunityId,
        keepupListingId: "listing-404",
        status: "Available",
      },
    ],
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.errors[0]?.code, "PUBLIC_COMMUNITY_NOT_FOUND");
  assert.ok(response.body.errors[0]?.publicCommunityIds?.includes(missingCommunityId));
});

test("publicHomes require keepupListingId or keepupLotId", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  await insertPublicCommunity(publicCommunityId, "Elm Grove");

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      {
        companyId,
        publicCommunityId,
        status: "Available",
      },
    ],
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.ok(Array.isArray(response.body.errors));
  assert.equal(response.body.errors[0]?.code, "HOME_ID_REQUIRED");
});

test("publicHomes resolve planCatalogId when keepupFloorPlanId exists; missing plan only warns", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  await insertPublicCommunity(publicCommunityId, "Sage Hollow");

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    planCatalog: [
      {
        companyId,
        keepupFloorPlanId: "plan-1",
        name: "Plan One",
      },
    ],
    publicHomes: [
      {
        companyId,
        publicCommunityId,
        keepupListingId: "listing-with-plan",
        keepupFloorPlanId: "plan-1",
        status: "Available",
      },
      {
        companyId,
        publicCommunityId,
        keepupListingId: "listing-missing-plan",
        keepupFloorPlanId: "plan-missing",
        status: "Available",
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.counts.publicHomesUpserted, 2);
  const warning = findWarningByCode(response.body.warnings, "PLAN_CATALOG_LINK_MISSING");
  assert.ok(warning);
  assert.ok(Array.isArray(warning.missingPlanCatalogRefs));
  assert.ok(warning.missingPlanCatalogRefs.some((row) => row.keepupFloorPlanId === "plan-missing"));

  const catalog = await PlanCatalog.findOne({ companyId, keepupFloorPlanId: "plan-1" }).lean();
  assert.ok(catalog?._id);

  const linkedHome = await findKeepupHome("listing-with-plan");
  assert.ok(linkedHome);
  assert.equal(String(linkedHome.planCatalogId), String(catalog._id));

  const unlinkedHome = await findKeepupHome("listing-missing-plan");
  assert.ok(unlinkedHome);
  assert.equal(unlinkedHome.planCatalogId ?? null, null);
});

test("publicHomes skip update when same company/sourceHomeId exists as non-keepup", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  await insertPublicCommunity(publicCommunityId, "Creekside");

  const scraperDoc = await PublicHome.create({
    companyId: new mongoose.Types.ObjectId(companyId),
    publicCommunityId: new mongoose.Types.ObjectId(publicCommunityId),
    stableId: "scraper:redfin:listing-collision",
    source: {
      type: "scraper",
      provider: "redfin",
      externalId: "listing-collision",
      ingestedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "scraper-test",
    },
    sourceHomeId: "listing-collision",
    status: "Available",
    price: 123000,
  });

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      {
        companyId,
        publicCommunityId,
        keepupListingId: "listing-collision",
        status: "Sold",
        price: { list: 500000 },
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.counts.publicHomesUpserted, 0);
  const warning = findWarningByCode(response.body.warnings, "SKIPPED_NON_KEEPUP_HOME");
  assert.ok(warning);
  assert.equal(warning.sourceHomeId, "listing-collision");

  const keepupDoc = await findKeepupHome("listing-collision");
  assert.equal(keepupDoc, null);

  const scraperAfter = await PublicHome.findById(scraperDoc._id).lean();
  assert.equal(scraperAfter.status, "Available");
  assert.equal(scraperAfter.price, 123000);
});

test("publicHomes supports unpublishMissingHomes soft deactivation", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  await insertPublicCommunity(publicCommunityId, "Brookfield");

  const initial = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      { companyId, publicCommunityId, keepupListingId: "home-1", status: "Available" },
      { companyId, publicCommunityId, keepupListingId: "home-2", status: "Available" },
    ],
  });
  assert.equal(initial.status, 200);
  assert.equal(initial.body.counts.publicHomesUpserted, 2);

  await PublicHome.create({
    companyId: new mongoose.Types.ObjectId(companyId),
    publicCommunityId: new mongoose.Types.ObjectId(publicCommunityId),
    stableId: "scraper:zillow:home-3",
    source: {
      type: "scraper",
      provider: "zillow",
      externalId: "home-3",
      ingestedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "scraper-test",
    },
    sourceHomeId: "home-3",
    isActive: true,
    published: true,
    status: "Available",
  });

  const second = await postBundle({
    meta: {
      keepupCompanyId: companyId,
      requestedAt: nowIso(),
      publisherVersion: "keepup-test",
      unpublishMissingHomes: true,
    },
    publicHomes: [
      { companyId, publicCommunityId, keepupListingId: "home-1", status: "Available" },
    ],
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.ok, true);
  assert.equal(second.body.counts.publicHomesUpserted, 1);
  assert.equal(second.body.counts.publicHomesDeactivated, 1);

  const home1 = await findKeepupHome("home-1");
  const home2 = await findKeepupHome("home-2");
  const scraperHome = await PublicHome.findOne({ stableId: "scraper:zillow:home-3" }).lean();
  assert.equal(home1.isActive, true);
  assert.equal(home2.isActive, false);
  assert.equal(scraperHome.isActive, true);
});

test("legacy publicHomes without source are upgraded to keepup ownership when republished", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  await insertPublicCommunity(publicCommunityId, "Legacy Oaks");

  const legacyDoc = await PublicHome.create({
    companyId: new mongoose.Types.ObjectId(companyId),
    publicCommunityId: new mongoose.Types.ObjectId(publicCommunityId),
    sourceHomeId: "legacy-home",
    keepupListingId: "legacy-home",
    status: "Available",
    price: 250000,
  });

  const response = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      {
        companyId,
        publicCommunityId,
        keepupListingId: "legacy-home",
        status: "Sold",
        price: { list: 275000 },
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.counts.publicHomesUpserted, 1);

  const updated = await findKeepupHome("legacy-home");
  assert.ok(updated);
  assert.equal(String(updated._id), String(legacyDoc._id));
  assert.equal(updated.source?.type, "keepup");
  assert.equal(updated.source?.updatedBy, "system");
  assert.equal(updated.status, "Sold");
  assert.equal(updated.price, 275000);
});

test("stableId unique index prevents duplicate public home inserts", async () => {
  await PublicHome.init();

  await PublicHome.create({
    stableId: "duplicate-stable-id",
    source: {
      type: "keepup",
      externalId: "duplicate-stable-id",
      ingestedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "test",
    },
    sourceHomeId: "duplicate-stable-id",
  });

  await assert.rejects(
    PublicHome.create({
      stableId: "duplicate-stable-id",
      source: {
        type: "manual",
        externalId: "manual-1",
        ingestedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: "tester",
      },
      sourceHomeId: "manual-1",
    }),
    (error) => Boolean(error) && error.code === 11000,
  );
});

test("publicHomes photo patch semantics preserve when omitted and replace when provided", async () => {
  const companyId = oid().toHexString();
  const publicCommunityId = oid().toHexString();
  await insertPublicCommunity(publicCommunityId, "Stone Ridge");

  const first = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      {
        companyId,
        publicCommunityId,
        keepupListingId: "photo-home",
        status: "Available",
        photos: [
          { url: "https://example.com/a.jpg", sortOrder: 0 },
          { url: "https://example.com/b.jpg", sortOrder: 1 },
        ],
      },
    ],
  });
  assert.equal(first.status, 200);

  const afterFirst = await findKeepupHome("photo-home");
  assert.equal(afterFirst.photos.length, 2);
  assert.deepEqual(afterFirst.images, ["https://example.com/a.jpg", "https://example.com/b.jpg"]);

  const second = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      {
        companyId,
        publicCommunityId,
        keepupListingId: "photo-home",
        status: "Sold",
      },
    ],
  });
  assert.equal(second.status, 200);

  const afterSecond = await findKeepupHome("photo-home");
  assert.equal(afterSecond.status, "Sold");
  assert.equal(afterSecond.photos.length, 2);
  assert.deepEqual(afterSecond.images, ["https://example.com/a.jpg", "https://example.com/b.jpg"]);

  const third = await postBundle({
    meta: { keepupCompanyId: companyId, requestedAt: nowIso(), publisherVersion: "keepup-test" },
    publicHomes: [
      {
        companyId,
        publicCommunityId,
        keepupListingId: "photo-home",
        photos: [
          { url: "https://example.com/new.jpg", sortOrder: 0 },
        ],
      },
    ],
  });
  assert.equal(third.status, 200);

  const afterThird = await findKeepupHome("photo-home");
  assert.equal(afterThird.photos.length, 1);
  assert.deepEqual(afterThird.images, ["https://example.com/new.jpg"]);
});
