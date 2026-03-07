const mongoose = require("mongoose");

const visibilityEnum = ["hidden", "public", "gated"];
const commissionUnitEnum = ["percent", "flat", "unknown"];

const builderInCommunitySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    publicCommunityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "PublicCommunity",
      index: true,
    },
    keepupCommunityId: { type: String },
    builder: {
      name: { type: String },
      slug: { type: String },
    },
    webData: {
      primaryContact: {
        name: { type: String },
        phone: { type: String },
        email: { type: String },
      },
      contactVisibility: {
        showName: { type: Boolean },
        showPhone: { type: Boolean },
        showEmail: { type: Boolean, default: false },
      },
      totalLots: { type: Number },
      schools: {
        elementary: { type: String },
        middle: { type: String },
        high: { type: String },
      },
      amenities: [
        {
          _id: false,
          label: { type: String, trim: true },
        },
      ],
      productTypes: [
        {
          _id: false,
          label: { type: String, trim: true },
        },
      ],
      promo: {
        headline: { type: String, trim: true },
        description: { type: String, trim: true },
        disclaimer: { type: String, trim: true },
      },
      hoa: {
        amount: { type: Number },
        cadence: { type: String },
      },
      taxRate: { type: Number },
      mudTaxRate: { type: Number },
      taxDistrict: { type: String },
      hoaIncludes: [{ type: String, trim: true }],
      hasPID: { type: Boolean },
      hasMUD: { type: Boolean },
      pidFeeAmount: { type: Number },
      pidFeeFrequency: { type: String },
      mudFeeAmount: { type: Number },
      earnestMoney: {
        amount: { type: Number },
        visibility: { type: String, enum: visibilityEnum, default: "hidden" },
      },
      realtorCommission: {
        amount: { type: Number },
        unit: { type: String, enum: commissionUnitEnum },
        visibility: { type: String, enum: visibilityEnum, default: "hidden" },
      },
      notesInternal: { type: String },
    },
    presentation: {
      heroImageUrl: { type: String },
      description: { type: String },
      promotion: { type: String },
    },
    visibility: {
      isPublished: { type: Boolean, default: true },
    },
    modelsSummary: [
      {
        _id: false,
        address: { type: String },
        listingId: { type: String },
        floorPlanName: { type: String },
      },
    ],
    source: { type: String, enum: ["keepup", "manual", "scraper"], default: "keepup" },
    lastPublishedAt: { type: Date },
  },
  {
    timestamps: true,
    strict: true,
  },
);

builderInCommunitySchema.index(
  { companyId: 1, publicCommunityId: 1 },
  { unique: true, name: "company_publicCommunity_unique" },
);

module.exports = mongoose.model("BuilderInCommunity", builderInCommunitySchema, "BuilderInCommunity");
