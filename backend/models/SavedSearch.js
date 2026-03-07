const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    lastNotifiedAt: { type: Date, default: null },
  },
  { collection: "SavedSearches" },
);

savedSearchSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("SavedSearch", savedSearchSchema);
