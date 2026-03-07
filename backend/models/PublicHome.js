const mongoose = require("mongoose");

const homePhotoSchema = new mongoose.Schema(
  {
    url: { type: String },
    width: { type: Number },
    height: { type: Number },
    alt: { type: String },
    sortOrder: { type: Number },
  },
  { _id: false },
);

const homeAddressSchema = new mongoose.Schema(
  {
    line1: { type: String },
    street: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
  },
  { _id: false },
);

const homeGeoSchema = new mongoose.Schema(
  {
    lat: { type: Number },
    lng: { type: Number },
  },
  { _id: false },
);

const homeMarketingSchema = new mongoose.Schema(
  {
    headline: { type: String },
    description: { type: String },
    features: [{ type: String }],
  },
  { _id: false },
);

const homePromoSchema = new mongoose.Schema(
  {
    headline: { type: String, trim: true },
    description: { type: String, trim: true },
    disclaimer: { type: String, trim: true },
  },
  { _id: false },
);

const homeSourceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["keepup", "scraper", "manual"] },
    provider: { type: String },
    externalId: { type: String },
    ingestedAt: { type: Date },
    updatedAt: { type: Date },
    updatedBy: { type: String },
  },
  { _id: false },
);

const publicHomeSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, index: true },
    publicCommunityId: { type: mongoose.Schema.Types.ObjectId, index: true, ref: "PublicCommunity" },
    keepupCommunityId: { type: String },

    stableId: { type: String, index: true },
    source: { type: homeSourceSchema, default: undefined },
    sourceHomeId: { type: String, index: true },
    keepupListingId: { type: String },
    keepupLotId: { type: String },

    keepupFloorPlanId: { type: String },
    planCatalogId: { type: mongoose.Schema.Types.ObjectId, ref: "PlanCatalog", index: true },

    address1: { type: String },
    addressLine1: { type: String },
    city: { type: String },
    state: { type: String },
    postalCode: { type: String },
    formattedAddress: { type: String },
    address: homeAddressSchema,
    geo: homeGeoSchema,
    coordinates: homeGeoSchema,
    location: homeGeoSchema,

    status: { type: String },
    price: { type: Number, min: 0 },
    listPrice: { type: Number, min: 0 },
    salePrice: { type: Number, min: 0 },
    beds: { type: Number, min: 0 },
    baths: { type: Number, min: 0 },
    sqft: { type: Number, min: 0 },
    lotSize: { type: String },
    garage: { type: String },

    marketing: homeMarketingSchema,
    promo: homePromoSchema,
    promoMode: { type: String, enum: ["add", "override"] },
    features: [{ type: String }],
    photos: [homePhotoSchema],
    primaryPhotoUrl: { type: String },
    heroImage: { type: String },
    heroImages: [{ type: String }],
    images: [{ type: String }],
    title: { type: String },
    description: { type: String },
    highlights: { type: String },

    isActive: { type: Boolean, default: true, index: true },
    published: { type: Boolean, default: true },
    lastPublishedAt: { type: Date },
  },
  {
    timestamps: true,
    strict: true,
  },
);

publicHomeSchema.index(
  { stableId: 1 },
  {
    unique: true,
    name: "stableId_unique",
    partialFilterExpression: {
      stableId: { $exists: true, $type: "string" },
    },
  },
);

publicHomeSchema.index(
  { companyId: 1, "source.type": 1, sourceHomeId: 1 },
  {
    unique: true,
    name: "company_sourceType_sourceHomeId_unique",
    partialFilterExpression: {
      companyId: { $exists: true },
      "source.type": { $exists: true, $type: "string" },
      sourceHomeId: { $exists: true, $type: "string" },
    },
  },
);

publicHomeSchema.index(
  { companyId: 1, publicCommunityId: 1, "source.type": 1, isActive: 1 },
  { name: "company_community_sourceType_active_idx" },
);

publicHomeSchema.index(
  { publicCommunityId: 1, isActive: 1, status: 1, price: 1 },
  { name: "community_active_status_price_idx" },
);

publicHomeSchema.index(
  { companyId: 1, isActive: 1, status: 1, price: 1 },
  { name: "company_active_status_price_idx" },
);

publicHomeSchema.index(
  { isActive: 1, lastPublishedAt: -1, updatedAt: -1 },
  { name: "active_published_updated_idx" },
);

publicHomeSchema.index(
  { isActive: 1, beds: 1, baths: 1, sqft: 1 },
  { name: "active_beds_baths_sqft_idx" },
);

publicHomeSchema.path("stableId").validate(function validateStableId(value) {
  const stableId = typeof value === "string" ? value.trim() : "";
  const sourceType =
    this && this.source && typeof this.source === "object" && !Array.isArray(this.source)
      ? this.source.type
      : undefined;
  if (sourceType !== "scraper" || !stableId) {
    return true;
  }
  return stableId.startsWith("scraper:");
}, "scraper stableId must start with \"scraper:\"");

module.exports = mongoose.model("PublicHome", publicHomeSchema, "PublicHome");
