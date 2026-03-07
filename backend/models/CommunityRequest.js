const mongoose = require("mongoose");
const { normalizeName } = require("../utils/normalizeName");

const communityRequestSchema = new mongoose.Schema(
  {
    requestedName: { type: String, required: true, trim: true },
    normalizedRequestedName: { type: String, required: true, index: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "linked", "rejected"],
      default: "pending",
      index: true,
    },
    resolvedCommunityId: { type: mongoose.Schema.Types.ObjectId, ref: "Community", default: null },
    canonicalNameAtResolve: { type: String, default: "" },
    rejectedReason: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    reviewedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    source: {
      keepupCommunityId: { type: String },
      companyId: { type: String },
      userId: { type: String },
    },
  },
  { timestamps: true, collection: "CommunityRequests" },
);

communityRequestSchema.pre("validate", function setNormalized(next) {
  if (this.isModified("requestedName")) {
    this.normalizedRequestedName = normalizeName(this.requestedName);
  }
  next();
});

module.exports = mongoose.model("CommunityRequest", communityRequestSchema);
