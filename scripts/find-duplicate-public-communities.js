/* eslint-disable no-console */
/**
 * Detect duplicate PublicCommunity documents by normalized name/city/state (and optional coords).
 * Prints groups with more than one doc.
 */
const { MongoClient } = require("mongodb");
const { computeCanonicalKey, COMMUNITY_COLLECTION_CANDIDATES } = require("../shared/communityResolver");

const uri = process.env.BUILDROOTZ_MONGODB_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/BuildRootz";
const dbName = process.env.BUILDROOTZ_DB_NAME || "BuildRootz";

async function resolveCommunityCollection(db) {
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  const found =
    COMMUNITY_COLLECTION_CANDIDATES.find((name) => names.includes(name)) ||
    COMMUNITY_COLLECTION_CANDIDATES[0];
  return db.collection(found);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const col = await resolveCommunityCollection(db);

  const cursor = col.find({});
  const groups = new Map();
  // eslint-disable-next-line no-await-in-loop
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const key =
      doc.canonicalKey ||
      computeCanonicalKey({
        name: doc.name,
        city: doc.city,
        state: doc.state,
        location: doc.location,
      }) ||
      "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }

  let dupes = 0;
  groups.forEach((docs, key) => {
    if (docs.length > 1) {
      dupes += 1;
      console.warn(`Duplicate group key=${key}: count=${docs.length}`);
      docs.forEach((d) => {
        console.warn(
          `  _id=${d._id} slug=${d.slug} keepupCommunityId=${d.keepupCommunityId || d.communityId || ""} name=${d.name} city=${d.city} state=${d.state}`,
        );
      });
    }
  });

  if (!dupes) {
    console.log("No duplicate PublicCommunity groups found.");
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
