const mongoose = require("mongoose");

const builderProfileSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    builderName: { type: String },
    builderSlug: { type: String, index: true },
    description: { type: String },
    website: { type: String },
    logoUrl: { type: String },
    primaryColor: { type: String },
    secondaryColor: { type: String },
    pricingDisclaimer: { type: String },
  },
  {
    timestamps: true,
    strict: true,
  },
);

module.exports = mongoose.model("BuilderProfile", builderProfileSchema, "BuilderProfile");
