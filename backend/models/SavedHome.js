const mongoose = require('mongoose');

const savedHomeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listingId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "SavedHomes" },
);

savedHomeSchema.index({ userId: 1, listingId: 1 }, { unique: true });

module.exports = mongoose.model("SavedHome", savedHomeSchema);
