const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { sanitizeUser, verifySessionToken, SESSION_COOKIE_NAME } = require("../services/authService");
const {
  getSavedHomesForUser,
  addSavedHome,
  removeSavedHome,
  mergeSavedHomes,
  countSavedHomes,
} = require("../services/savedHomeService");
const {
  getSavedCommunitiesForUser,
  addSavedCommunity,
  removeSavedCommunity,
  mergeSavedCommunities,
  countSavedCommunities,
} = require("../services/savedCommunityService");
const {
  getSavedSearchesForUser,
  createSavedSearch,
  deleteSavedSearch,
  updateAlertPreferences,
  countSavedSearches,
} = require("../services/savedSearchService");
const mongoose = require("mongoose");
const { resolvePublicCommunity } = require("../utils/communityResolver");
const User = require("../models/User");

const router = express.Router();

function handleError(res, err) {
  const status = err.status || 500;
  const message = err.message || "Something went wrong.";
  return res.status(status).json({ success: false, error: message });
}

router.get("/", async (req, res) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token) {
      return res.json({
        success: true,
        user: null,
        counts: { savedHomes: 0, savedCommunities: 0, savedSearches: 0 },
      });
    }
    let userId = null;
    try {
      const payload = verifySessionToken(token);
      userId = payload.sub || payload.userId;
    } catch {
      return res.json({
        success: true,
        user: null,
        counts: { savedHomes: 0, savedCommunities: 0, savedSearches: 0 },
      });
    }
    if (!userId) {
      return res.json({
        success: true,
        user: null,
        counts: { savedHomes: 0, savedCommunities: 0, savedSearches: 0 },
      });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.json({
        success: true,
        user: null,
        counts: { savedHomes: 0, savedCommunities: 0, savedSearches: 0 },
      });
    }
    const [savedHomesCount, savedCommunitiesCount, savedSearchesCount] = await Promise.all([
      countSavedHomes(userId),
      countSavedCommunities(userId),
      countSavedSearches(userId),
    ]);
    return res.json({
      success: true,
      user: sanitizeUser(user),
      counts: {
        savedHomes: savedHomesCount,
        savedCommunities: savedCommunitiesCount,
        savedSearches: savedSearchesCount,
      },
    });
  } catch (err) {
    return handleError(res, err);
  }
});

router.use(requireAuth);

router.get("/saved-homes", async (req, res) => {
  try {
    const savedHomes = await getSavedHomesForUser(req.user._id);
    return res.json({ success: true, savedHomes });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/saved-homes", async (req, res) => {
  try {
    const { listingId, listingIds } = req.body || {};
    if (Array.isArray(listingIds) && listingIds.length) {
      await mergeSavedHomes(req.user._id, listingIds);
      const savedHomes = await getSavedHomesForUser(req.user._id);
      return res.status(201).json({ success: true, savedHomes });
    }
    const savedHome = await addSavedHome(req.user._id, listingId);
    return res.status(201).json({ success: true, savedHome });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/saved-homes/:listingId", async (req, res) => {
  try {
    const ok = await removeSavedHome(req.user._id, req.params.listingId);
    return res.json({ success: ok, removed: ok });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/saved-communities", async (req, res) => {
  try {
    const savedCommunities = await getSavedCommunitiesForUser(req.user._id);
    const db = mongoose.connection.db;
    const strict = process.env.STRICT_IDS === "true";
    if (!strict) {
      for (const item of savedCommunities) {
        if (!item.publicCommunityId && item.communityId) {
          const resolved = await resolvePublicCommunity(db, item.communityId);
          if (resolved?._id) {
            item.publicCommunityId = resolved._id;
            item.keepupCommunityId = item.keepupCommunityId || resolved.keepupCommunityId;
            item.communitySlug = item.communitySlug || resolved.slug;
          }
        }
      }
    } else {
      const legacyCount = savedCommunities.filter((c) => !c.publicCommunityId && c.communityId).length;
      if (legacyCount) {
        // eslint-disable-next-line no-console
        console.warn(`[STRICT_IDS] Found ${legacyCount} saved communities lacking publicCommunityId`);
      }
    }
    return res.json({ success: true, savedCommunities });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/saved-communities", async (req, res) => {
  try {
    const { communityId, publicCommunityId, slug, communityIds } = req.body || {};
    const db = mongoose.connection.db;
    const resolveId = async (id) => {
      const resolved = await resolvePublicCommunity(db, id);
      return resolved?._id || null;
    };

    if (Array.isArray(communityIds) && communityIds.length) {
      await mergeSavedCommunities(req.user._id, communityIds, resolveId);
      const savedCommunities = await getSavedCommunitiesForUser(req.user._id);
      return res.status(201).json({ success: true, savedCommunities });
    }
    const incomingId = publicCommunityId || communityId || slug;
    const resolved = await resolvePublicCommunity(db, incomingId);
    if (!resolved?._id) {
      const err = new Error("Community not found");
      err.status = 404;
      throw err;
    }
    const savedCommunity = await addSavedCommunity(req.user._id, {
      publicCommunityId: resolved._id,
      legacyCommunityId: communityId || slug || publicCommunityId,
      keepupCommunityId: resolved.keepupCommunityId || communityId,
      communitySlug: resolved.slug || slug,
    });
    return res.status(201).json({ success: true, savedCommunity });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/saved-communities/:communityId", async (req, res) => {
  try {
    const id = req.params.communityId;
    const db = mongoose.connection.db;
    const resolved = await resolvePublicCommunity(db, id);
    const ok = await removeSavedCommunity(req.user._id, resolved?._id || id);
    return res.json({ success: ok, removed: ok });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/saved-searches", async (req, res) => {
  try {
    const savedSearches = await getSavedSearchesForUser(req.user._id);
    return res.json({ success: true, savedSearches });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/saved-searches", async (req, res) => {
  try {
    const { name, filters } = req.body || {};
    const savedSearch = await createSavedSearch(req.user._id, { name, filters });
    return res.status(201).json({ success: true, savedSearch });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/saved-searches/:id", async (req, res) => {
  try {
    await deleteSavedSearch(req.user._id, req.params.id);
    return res.json({ success: true, removed: true });
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch("/alerts", async (req, res) => {
  try {
    const prefs = req.body || {};
    const user = await updateAlertPreferences(req.user._id, prefs);
    return res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
