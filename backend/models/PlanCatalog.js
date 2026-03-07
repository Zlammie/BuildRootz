const mongoose = require("mongoose");

const planImageSchema = new mongoose.Schema(
  {
    url: { type: String },
    width: { type: Number },
    height: { type: Number },
    alt: { type: String },
  },
  { _id: false },
);

const planAssetSchema = new mongoose.Schema(
  {
    fileUrl: { type: String },
    previewUrl: { type: String },
    originalFilename: { type: String },
    mimeType: { type: String },
  },
  { _id: false },
);

const planCatalogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    keepupFloorPlanId: { type: String, required: true, index: true },
    source: { type: String, enum: ["keepup", "scraper", "manual"], default: "keepup" },
    name: { type: String, required: true },
    slug: { type: String },
    beds: { type: Number },
    baths: { type: Number },
    halfBaths: { type: Number },
    sqft: { type: Number },
    stories: { type: Number },
    garage: { type: String },
    garageSpaces: { type: Number },
    description: { type: String },
    features: [{ type: String }],
    images: [planImageSchema],
    asset: planAssetSchema,
    primaryImageUrl: { type: String },
    productType: { type: String },
    lastPublishedAt: { type: Date },
  },
  {
    timestamps: true,
    strict: true,
  },
);

planCatalogSchema.index(
  { companyId: 1, keepupFloorPlanId: 1 },
  { unique: true, name: "company_keepupFloorPlan_unique" },
);

module.exports = mongoose.model("PlanCatalog", planCatalogSchema, "PlanCatalog");
