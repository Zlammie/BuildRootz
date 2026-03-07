const express = require("express");
const {
  registerUser,
  loginUser,
  sanitizeUser,
  setSessionCookie,
  clearSessionCookie,
} = require("../services/authService");
const { mergeSavedHomes, countSavedHomes } = require("../services/savedHomeService");
const {
  mergeSavedCommunities,
  countSavedCommunities,
} = require("../services/savedCommunityService");
const { countSavedSearches } = require("../services/savedSearchService");

const router = express.Router();

function handleError(res, err) {
  const status = err.status || 500;
  const message = err.message || "Something went wrong.";
  return res.status(status).json({ success: false, error: message });
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, savedListingIds, savedCommunityIds } = req.body || {};
    const { user, token } = await registerUser({ email, password });

    if (Array.isArray(savedListingIds) && savedListingIds.length) {
      await mergeSavedHomes(user._id, savedListingIds);
    }
    if (Array.isArray(savedCommunityIds) && savedCommunityIds.length) {
      await mergeSavedCommunities(user._id, savedCommunityIds);
    }

    setSessionCookie(res, token);
    const counts = {
      savedHomes: await countSavedHomes(user._id),
      savedCommunities: await countSavedCommunities(user._id),
      savedSearches: await countSavedSearches(user._id),
    };
    return res.status(201).json({ success: true, user: sanitizeUser(user), counts });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password, savedListingIds, savedCommunityIds } = req.body || {};
    const { user, token } = await loginUser({ email, password, savedListingIds });
    if (Array.isArray(savedCommunityIds) && savedCommunityIds.length) {
      await mergeSavedCommunities(user._id, savedCommunityIds);
    }
    setSessionCookie(res, token);
    const counts = {
      savedHomes: await countSavedHomes(user._id),
      savedCommunities: await countSavedCommunities(user._id),
      savedSearches: await countSavedSearches(user._id),
    };
    return res.json({ success: true, user: sanitizeUser(user), counts });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.json({ success: true });
});

module.exports = router;
