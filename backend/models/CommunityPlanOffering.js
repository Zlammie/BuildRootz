const mongoose = require("mongoose");

const communityPlanOfferingSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    publicCommunityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "PublicCommunity",
      index: true,
    },
    planCatalogId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "PlanCatalog",
      index: true,
    },
    keepupCommunityId: { type: String },
    keepupFloorPlanId: { type: String },
    isIncluded: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    basePriceFrom: { type: Number, min: 0 },
    basePriceAsOf: { type: Date },
    basePriceVisibility: { type: String, enum: ["hidden", "public"], default: "public" },
    basePriceNotesInternal: { type: String },
    descriptionOverride: { type: String },
    primaryImageOverrideUrl: { type: String },
    badges: [{ type: String }],
    source: { type: String, enum: ["keepup", "manual", "scraper"], default: "keepup" },
    lastPublishedAt: { type: Date },
  },
  {
    timestamps: true,
    strict: true,
  },
);

communityPlanOfferingSchema.index(
  { companyId: 1, publicCommunityId: 1, planCatalogId: 1 },
  { unique: true, name: "company_community_plan_unique" },
);
communityPlanOfferingSchema.index(
  { publicCommunityId: 1, companyId: 1 },
  { name: "community_company_idx" },
);
communityPlanOfferingSchema.index(
  { companyId: 1, publicCommunityId: 1, sortOrder: 1 },
  { name: "company_community_sortOrder_idx" },
);

module.exports = mongoose.model("CommunityPlanOffering", communityPlanOfferingSchema, "CommunityPlanOffering");
