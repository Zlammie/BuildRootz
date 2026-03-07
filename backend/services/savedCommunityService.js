const SavedCommunity = require("../models/SavedCommunity");
const mongoose = require("mongoose");

async function getSavedCommunitiesForUser(userId) {
  return SavedCommunity.find({ userId }).sort({ createdAt: -1 }).lean();
}

async function addSavedCommunity(
  userId,
  { publicCommunityId, legacyCommunityId, keepupCommunityId, communitySlug },
) {
  if (!publicCommunityId) {
    const err = new Error("A publicCommunityId is required.");
    err.status = 400;
    throw err;
  }
  const trimmedPublicId = String(publicCommunityId).trim();
  const trimmedLegacy = legacyCommunityId ? String(legacyCommunityId).trim() : undefined;
  const trimmedKeepup = keepupCommunityId ? String(keepupCommunityId).trim() : undefined;

  const update = {
    $setOnInsert: {
      userId,
      publicCommunityId: trimmedPublicId,
      communityId: trimmedLegacy || trimmedPublicId,
      keepupCommunityId: trimmedKeepup,
      communitySlug,
      createdAt: new Date(),
    },
    $set: {
      publicCommunityId: trimmedPublicId,
      ...(trimmedKeepup ? { keepupCommunityId: trimmedKeepup } : {}),
      ...(communitySlug ? { communitySlug } : {}),
    },
  };

  const saved = await SavedCommunity.findOneAndUpdate(
    {
      userId,
      $or: [{ publicCommunityId: trimmedPublicId }, { communityId: trimmedLegacy || trimmedPublicId }],
    },
    update,
    { upsert: true, new: true },
  );
  return saved;
}

async function removeSavedCommunity(userId, publicCommunityId) {
  if (!publicCommunityId) return false;
  const idStr = String(publicCommunityId).trim();
  const result = await SavedCommunity.deleteMany({
    userId,
    $or: [{ publicCommunityId: idStr }, { communityId: idStr }],
  });
  return (result?.deletedCount || 0) > 0;
}

async function mergeSavedCommunities(
  userId,
  communityIds = [],
  publicCommunityIdResolver = async () => null,
) {
  const uniqueIds = Array.from(
    new Set(
      communityIds
        .filter((id) => typeof id === "string" && id.trim())
        .map((id) => id.trim()),
    ),
  );
  if (!uniqueIds.length) return 0;

  const ops = [];

  for (const legacyId of uniqueIds) {
    const resolvedPublicId = await publicCommunityIdResolver(legacyId);
    ops.push({
      updateOne: {
        filter: {
          userId,
          $or: [{ publicCommunityId: resolvedPublicId || legacyId }, { communityId: legacyId }],
        },
        update: {
          $setOnInsert: {
            userId,
            publicCommunityId: resolvedPublicId || undefined,
            communityId: legacyId,
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  await SavedCommunity.bulkWrite(ops, { ordered: false });
  return uniqueIds.length;
}

async function countSavedCommunities(userId) {
  return SavedCommunity.countDocuments({ userId });
}

module.exports = {
  getSavedCommunitiesForUser,
  addSavedCommunity,
  removeSavedCommunity,
  mergeSavedCommunities,
  countSavedCommunities,
};
