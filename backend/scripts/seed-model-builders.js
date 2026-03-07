/* eslint-disable no-console */
/**
 * Dev-only seed for public builders endpoint.
 *
 * Inserts:
 * - One community (fake ObjectId) referenced by two builders.
 * - Three model listings:
 *    - Builder A: one published=true (newer), one published=false (older)
 *    - Builder B: one published=true (model)
 *
 * Guards:
 * - Requires NODE_ENV=development or SEED_ALLOW=1
 */

const { MongoClient, ObjectId } = require("mongodb");

const uri = process.env.BUILDROOTZ_MONGODB_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/BuildRootz";
const dbName = process.env.BUILDROOTZ_DB_NAME || "BuildRootz";

if (process.env.NODE_ENV !== "development" && process.env.SEED_ALLOW !== "1") {
  console.error("Refusing to seed: set NODE_ENV=development or SEED_ALLOW=1");
  process.exit(1);
}

async function run() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const communityId = new ObjectId("66aaaaaa0000000000000001");
  const builderA = { id: "builder-a", name: "Builder A" };
  const builderB = { id: "builder-b", name: "Builder B" };

  const homesCol = db.collection("PublicHome");

  // Clean previous seed
  await homesCol.deleteMany({ communityId: communityId.toHexString(), status: /model/i });

  const now = new Date();
  const older = new Date(now.getTime() - 1000 * 60 * 60 * 24);

  const docs = [
    {
      _id: new ObjectId(),
      communityId: communityId.toHexString(),
      builderId: builderA.id,
      builder: builderA.name,
      title: "A Model (published)",
      status: "model",
      address: "100 Model Way",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      published: true,
      updatedAt: now,
    },
    {
      _id: new ObjectId(),
      communityId: communityId.toHexString(),
      builderId: builderA.id,
      builder: builderA.name,
      title: "A Model (unpublished older)",
      status: "model",
      address: "101 Model Way",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      published: false,
      updatedAt: older,
    },
    {
      _id: new ObjectId(),
      communityId: communityId.toHexString(),
      builderId: builderB.id,
      builder: builderB.name,
      title: "B Model",
      status: "model",
      address: "200 Model Ave",
      city: "Austin",
      state: "TX",
      postalCode: "78702",
      published: true,
      updatedAt: now,
    },
  ];

  await homesCol.insertMany(docs);

  console.log("Seeded model listings for community", communityId.toHexString());
  await client.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
