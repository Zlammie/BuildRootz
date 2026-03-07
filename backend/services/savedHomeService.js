const SavedHome = require("../models/SavedHome");

async function getSavedHomesForUser(userId) {
  return SavedHome.find({ userId }).sort({ createdAt: -1 }).lean();
}

async function addSavedHome(userId, listingId) {
  if (!listingId || typeof listingId !== "string") {
    const err = new Error("A listingId is required.");
    err.status = 400;
    throw err;
  }

  const trimmedId = listingId.trim();
  if (!trimmedId) {
    const err = new Error("A listingId is required.");
    err.status = 400;
    throw err;
  }

  const saved = await SavedHome.findOneAndUpdate(
    { userId, listingId: trimmedId },
    { $setOnInsert: { userId, listingId: trimmedId, createdAt: new Date() } },
    { upsert: true, new: true },
  );
  return saved;
}

async function removeSavedHome(userId, listingId) {
  if (!listingId) return false;
  const result = await SavedHome.findOneAndDelete({ userId, listingId });
  return Boolean(result);
}

async function mergeSavedHomes(userId, listingIds = []) {
  const uniqueIds = Array.from(
    new Set(
      listingIds
        .filter((id) => typeof id === "string" && id.trim())
        .map((id) => id.trim()),
    ),
  );
  if (!uniqueIds.length) return 0;

  const ops = uniqueIds.map((listingId) => ({
    updateOne: {
      filter: { userId, listingId },
      update: { $setOnInsert: { userId, listingId, createdAt: new Date() } },
      upsert: true,
    },
  }));

  await SavedHome.bulkWrite(ops, { ordered: false });
  return uniqueIds.length;
}

async function countSavedHomes(userId) {
  return SavedHome.countDocuments({ userId });
}

module.exports = {
  getSavedHomesForUser,
  addSavedHome,
  removeSavedHome,
  mergeSavedHomes,
  countSavedHomes,
};
