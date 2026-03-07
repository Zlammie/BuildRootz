const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const router = require("../routes/internal/internalCommunityRoutes");

const INTERNAL_KEY = "test-internal-community-key";

let mongoServer;
let server;
let baseUrl;

async function postCommunity(payload) {
  const response = await fetch(`${baseUrl}/api/internal/communities`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": INTERNAL_KEY,
    },
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function findPublicCommunityById(id) {
  return mongoose.connection.db.collection("PublicCommunity").findOne({
    _id: new mongoose.Types.ObjectId(id),
  });
}

test.before(async () => {
  process.env.BUILDROOTZ_INTERNAL_API_KEY = INTERNAL_KEY;
  process.env.NODE_ENV = "test";

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: "BuildRootz" });

  const app = express();
  app.use(express.json());
  app.use("/api/internal/communities", router);

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
  await mongoose.connection.db.createCollection("PublicCommunity").catch(() => {});
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

test("internal community create normalizes explicit and fallback slugs", async () => {
  const first = await postCommunity({
    name: "River Walk",
    city: "Celina",
    state: "TX",
    slug: "  River__Walk  ",
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.slug, "river-walk");

  const firstStored = await findPublicCommunityById(first.body.communityId);
  assert.equal(firstStored.slug, "river-walk");

  const second = await postCommunity({
    name: "River Walk",
    city: "Prosper",
    state: "TX",
  });
  assert.equal(second.status, 201);
  assert.equal(second.body.slug, "river-walk-1");

  const secondStored = await findPublicCommunityById(second.body.communityId);
  assert.equal(secondStored.slug, "river-walk-1");
});
