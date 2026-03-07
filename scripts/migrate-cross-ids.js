/* eslint-disable no-console */
/**
 * Migration: backfill canonical publicCommunityId / keepupCommunityId onto SavedCommunities and PublicHomes.
 *
 * Guarded: requires MIGRATE_CONFIRM=true
 *
 * Steps:
 * - PublicCommunity: keepupCommunityId <- communityId if missing
 * - PublicHome: keepupCommunityId/publicCommunityId from legacy fields; publicCommunityId resolved via community collection
 * - SavedCommunity: set publicCommunityId; dedupe per user+publicCommunityId
 *
 * Idempotent-ish: safe to rerun; will skip existing fields.
 */

const mongoose = require("mongoose");

const MONGO_URI = process.env.BUILDROOTZ_MONGODB_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/BuildRootz";
const DB_NAME = process.env.BUILDROOTZ_DB_NAME || "BuildRootz";

if (process.env.MIGRATE_CONFIRM !== "true") {
  console.error("Set MIGRATE_CONFIRM=true to run this migration.");
  process.exit(1);
}

const COMMUNITY_COLLECTION_CANDIDATES = [
  "PublicCommunity",
  "PublicCommunities",
  "publiccommunities",
  "publiccommunity",
];

const HOME_COLLECTION_CANDIDATES = [
  "PublicHome",
  "PublicHomes",
  "publichomes",
  "publichome",
  "PublicHome_v2",
];

async function resolveCommunityCollection(db) {
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  const found =
    COMMUNITY_COLLECTION_CANDIDATES.find((name) => names.includes(name)) ||
    COMMUNITY_COLLECTION_CANDIDATES[0];
  return db.collection(found);
}

async function resolveHomeCollection(db) {
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  const found =
    HOME_COLLECTION_CANDIDATES.find((name) => names.includes(name)) || HOME_COLLECTION_CANDIDATES[0];
  return db.collection(found);
}

async function main() {
  await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  const communityCol = await resolveCommunityCollection(db);
  const homeCol = await resolveHomeCollection(db);
  const savedCommunityCol = db.collection("SavedCommunities");

  let updatedCommunities = 0;
  const communities = await communityCol
    .find({ keepupCommunityId: { $exists: false } })
    .toArray();
  for (const doc of communities) {
    if (doc.communityId) {
      await communityCol.updateOne(
        { _id: doc._id },
        { $set: { keepupCommunityId: doc.communityId } },
      );
      updatedCommunities++;
    }
  }

  // build lookup map keepupCommunityId -> _id
  const commDocs = await communityCol.find({}).project({ _id: 1, keepupCommunityId: 1, slug: 1 }).toArray();
  const byKeepup = new Map();
  const byId = new Map();
  commDocs.forEach((c) => {
    if (c.keepupCommunityId) byKeepup.set(String(c.keepupCommunityId), c._id.toString());
    byId.set(c._id.toString(), c._id.toString());
  });

  const toHomeUpdates = [];
  const cursor = homeCol.find({});
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const updates = {};
    const legacyKeepup = doc.keepupCommunityId || doc.communityId || doc.community_id || doc.buildrootzCommunityId;
    if (legacyKeepup && !doc.keepupCommunityId) {
      updates.keepupCommunityId = legacyKeepup;
    }
    if (!doc.publicCommunityId) {
      const resolved =
        (legacyKeepup && (byId.get(String(legacyKeepup)) || byKeepup.get(String(legacyKeepup)))) ||
        null;
      if (resolved) updates.publicCommunityId = resolved;
    }
    if (Object.keys(updates).length) {
      toHomeUpdates.push({ _id: doc._id, updates });
    }
  }
  let updatedHomes = 0;
  for (const item of toHomeUpdates) {
    await homeCol.updateOne({ _id: item._id }, { $set: item.updates });
    updatedHomes++;
  }

  // Saved communities
  const savedDocs = await savedCommunityCol.find({}).toArray();
  let savedUpdated = 0;
  let unresolved = 0;
  const dedupeKeys = new Set();
  for (const doc of savedDocs) {
    const target = doc.publicCommunityId;
    let publicId = target;
    if (!publicId) {
      const legacy = doc.communityId;
      if (legacy) {
        publicId = byId.get(String(legacy)) || byKeepup.get(String(legacy)) || null;
      }
    }
    if (!publicId) {
      unresolved++;
      continue;
    }
    const key = `${doc.userId}_${publicId}`;
    if (dedupeKeys.has(key)) {
      await savedCommunityCol.deleteOne({ _id: doc._id });
      continue;
    }
    dedupeKeys.add(key);
    if (!doc.publicCommunityId) {
      await savedCommunityCol.updateOne(
        { _id: doc._id },
        { $set: { publicCommunityId: publicId } },
      );
      savedUpdated++;
    }
  }

  console.log("Communities updated keepupCommunityId:", updatedCommunities);
  console.log("Homes updated public/keepup:", updatedHomes);
  console.log("Saved communities updated:", savedUpdated);
  console.log("Saved communities unresolved:", unresolved);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
