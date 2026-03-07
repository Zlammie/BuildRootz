const mongoose = require("mongoose");

const savedCommunitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Legacy field (KeepUp/general id). Deprecated: use publicCommunityId.
    communityId: { type: String },
    // Canonical BuildRootz PublicCommunity _id (string)
    publicCommunityId: { type: String, index: true },
    // Optional KeepUp id for reference
    keepupCommunityId: { type: String },
    // Optional slug snapshot for convenience
    communitySlug: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "SavedCommunities" },
);

savedCommunitySchema.index({ userId: 1, communityId: 1 }, { unique: true });
savedCommunitySchema.index(
  { userId: 1, publicCommunityId: 1 },
  {
    unique: true,
    partialFilterExpression: { publicCommunityId: { $type: "string" } },
    name: "user_publicCommunity_unique",
  },
);

module.exports = mongoose.model("SavedCommunity", savedCommunitySchema);
