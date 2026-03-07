/* eslint-disable no-console */
/**
 * Reports duplicate SavedCommunity documents for the same user + publicCommunityId.
 * Read-only helper to verify unique index state after migrations.
 */
const mongoose = require("mongoose");

const MONGO_URI = process.env.BUILDROOTZ_MONGODB_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/BuildRootz";
const DB_NAME = process.env.BUILDROOTZ_DB_NAME || "BuildRootz";

async function main() {
  await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  const col = db.collection("SavedCommunities");

  const duplicates = await col
    .aggregate([
      {
        $group: {
          _id: { userId: "$userId", publicCommunityId: "$publicCommunityId" },
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      {
        $match: {
          "count": { $gt: 1 },
          "_id.publicCommunityId": { $type: "string" },
        },
      },
    ])
    .toArray();

  if (!duplicates.length) {
    console.log("No duplicate saved communities found (userId + publicCommunityId).");
  } else {
    console.warn(`Found ${duplicates.length} duplicate groups:`);
    duplicates.forEach((dup) => {
      console.warn(
        `user=${dup._id.userId} publicCommunityId=${dup._id.publicCommunityId} count=${dup.count} ids=${dup.ids.join(",")}`,
      );
    });
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
