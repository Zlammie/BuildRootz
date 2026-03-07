const mongoose = require('mongoose');

const alertPreferencesSchema = new mongoose.Schema(
  {
    emailAlertsEnabled: { type: Boolean, default: true },
    frequency: { type: String, enum: ["daily", "weekly"], default: "weekly" },
    priceDrop: { type: Boolean, default: true },
    newMatches: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date },
    emailVerified: { type: Boolean, default: false },
    roles: { type: [String], default: ["consumer"] },
    alertPreferences: { type: alertPreferencesSchema, default: () => ({}) },
  },
  { collection: "Users" },
);

module.exports = mongoose.model("User", userSchema);
