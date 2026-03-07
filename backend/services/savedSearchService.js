const SavedSearch = require("../models/SavedSearch");
const User = require("../models/User");

async function getSavedSearchesForUser(userId) {
  return SavedSearch.find({ userId }).sort({ createdAt: -1 }).lean();
}

async function createSavedSearch(userId, { name, filters }) {
  if (!name || typeof name !== "string") {
    const err = new Error("A search name is required.");
    err.status = 400;
    throw err;
  }
  const safeFilters = typeof filters === "object" && filters !== null ? filters : {};
  try {
    const json = JSON.stringify(safeFilters);
    if (json.length > 5000) {
      const err = new Error("Filters are too large. Please simplify and try again.");
      err.status = 400;
      throw err;
    }
  } catch {
    const err = new Error("Filters must be valid JSON.");
    err.status = 400;
    throw err;
  }
  const savedSearch = await SavedSearch.create({
    userId,
    name: name.trim(),
    filters: safeFilters,
    createdAt: new Date(),
  });
  return savedSearch.toObject();
}

async function deleteSavedSearch(userId, searchId) {
  if (!searchId) {
    const err = new Error("A search id is required.");
    err.status = 400;
    throw err;
  }
  const deleted = await SavedSearch.findOneAndDelete({ _id: searchId, userId });
  if (!deleted) {
    const err = new Error("Saved search not found.");
    err.status = 404;
    throw err;
  }
  return true;
}

async function updateAlertPreferences(userId, prefs) {
  const allowed = ["emailAlertsEnabled", "frequency", "priceDrop", "newMatches"];
  const updates = {};
  allowed.forEach((key) => {
    if (prefs[key] !== undefined) updates[`alertPreferences.${key}`] = prefs[key];
  });
  if (prefs.frequency && !["daily", "weekly"].includes(prefs.frequency)) {
    const err = new Error("Frequency must be 'daily' or 'weekly'.");
    err.status = 400;
    throw err;
  }
  if (Object.keys(updates).length === 0) {
    const err = new Error("No alert preferences provided.");
    err.status = 400;
    throw err;
  }
  const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true });
  return user;
}

async function countSavedSearches(userId) {
  return SavedSearch.countDocuments({ userId });
}

module.exports = {
  getSavedSearchesForUser,
  createSavedSearch,
  deleteSavedSearch,
  updateAlertPreferences,
  countSavedSearches,
};
