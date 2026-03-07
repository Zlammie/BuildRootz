const express = require("express");
const mongoose = require("mongoose");
const requireAuth = require("../../middleware/requireAuth");
const requireAdmin = require("../../middleware/requireAdmin");
const CommunityRequest = require("../../models/CommunityRequest");
const { normalizeName } = require("../../utils/normalizeName");
const { ensureCommunityIndexes, COMMUNITY_COLLECTION_CANDIDATES } = require("../../utils/communityResolver");

const router = express.Router();

async function getCommunityCollection(db) {
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  const found = COMMUNITY_COLLECTION_CANDIDATES.find((name) => names.includes(name));
  if (!found) {
    throw new Error("Community collection not found");
  }
  const col = db.collection(found);
  await ensureCommunityIndexes(col).catch(() => {});
  return col;
}

function toObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}

function slugifyName(name = "") {
  return name
    .toString()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

async function loadRequest(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error("Invalid request id");
    err.status = 400;
    throw err;
  }
  const reqDoc = await CommunityRequest.findById(id).lean();
  if (!reqDoc) {
    const err = new Error("Request not found");
    err.status = 404;
    throw err;
  }
  return reqDoc;
}

async function findCommunityById(db, id) {
  const col = await getCommunityCollection(db);
  return col.findOne({ _id: toObjectId(id) });
}

async function searchCommunities(db, name, city, state) {
  const col = await getCommunityCollection(db);
  const regex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const match = {
    $or: [{ name: regex }, { aliases: regex }, { "aliases.label": regex }],
  };
  if (city) match.city = new RegExp(city, "i");
  if (state) match.state = new RegExp(state, "i");
  const docs = await col
    .find(match, { projection: { name: 1, city: 1, state: 1, aliases: 1 } })
    .limit(10)
    .toArray();
  return docs.map((doc) => ({
    _id: doc._id?.toString?.() || doc._id,
    name: doc.name || "",
    city: doc.city || "",
    state: doc.state || "",
    aliases: doc.aliases || [],
  }));
}

router.use(requireAuth);
router.use(requireAdmin);

// Admin list page (JSON)
router.get("/", async (req, res) => {
  try {
    const { q, status = "pending" } = req.query || {};
    const filter = {};
    if (status) filter.status = status;
    if (q) {
      const regex = new RegExp(q, "i");
      filter.$or = [{ requestedName: regex }, { city: regex }, { state: regex }];
    }
    const requests = await CommunityRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ results: requests });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: status === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR", message: err.message });
  }
});

// Admin detail with suggestions
router.get("/:id", async (req, res) => {
  try {
    const request = await loadRequest(req.params.id);
    const db = mongoose.connection.db;
    const suggestions = await searchCommunities(
      db,
      request.requestedName || "",
      request.city || "",
      request.state || "",
    );
    return res.json({ request, suggestions });
  } catch (err) {
    const status = err.status || 500;
    const error =
      status === 400 ? "BAD_REQUEST" : status === 404 ? "REQUEST_NOT_FOUND" : "INTERNAL_ERROR";
    return res.status(status).json({ error, message: err.message });
  }
});

// Approve and create new community
router.post("/:id/approve-create", async (req, res) => {
  try {
    const request = await loadRequest(req.params.id);
    const db = mongoose.connection.db;
    const col = await getCommunityCollection(db);

    const now = new Date();
    const doc = {
      name: request.requestedName,
      city: request.city,
      state: request.state,
      slug: slugifyName(request.requestedName),
      createdAt: now,
      updatedAt: now,
    };
    const insertResult = await col.insertOne(doc);

    await CommunityRequest.findByIdAndUpdate(request._id, {
      $set: {
        status: "approved",
        resolvedCommunityId: insertResult.insertedId,
        canonicalNameAtResolve: request.requestedName,
        reviewedAt: now,
        reviewedByUserId: req.user._id,
      },
    });

    return res.json({
      status: "approved",
      communityId: insertResult.insertedId.toString(),
      canonicalName: request.requestedName,
    });
  } catch (err) {
    const status = err.status || 500;
    const error =
      status === 400 ? "BAD_REQUEST" : status === 404 ? "REQUEST_NOT_FOUND" : "INTERNAL_ERROR";
    return res.status(status).json({ error, message: err.message });
  }
});

// Link to existing community
router.post("/:id/link-existing", async (req, res) => {
  try {
    const { communityId, addAlias } = req.body || {};
    if (!communityId || !mongoose.Types.ObjectId.isValid(communityId)) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "communityId is required" });
    }
    const request = await loadRequest(req.params.id);
    const db = mongoose.connection.db;
    const col = await getCommunityCollection(db);
    const existing = await findCommunityById(db, communityId);
    if (!existing) {
      return res.status(404).json({ error: "COMMUNITY_NOT_FOUND" });
    }

    if (addAlias) {
      const aliases = Array.isArray(existing.aliases) ? existing.aliases : [];
      const normalized = normalizeName(request.requestedName);
      const hasAlias = aliases.some(
        (a) => normalizeName(a?.label || a?.normalizedLabel || "") === normalized,
      );
      if (!hasAlias) {
        await col.updateOne(
          { _id: toObjectId(communityId) },
          {
            $push: {
              aliases: {
                label: request.requestedName,
                normalizedLabel: normalized,
                source: "request",
                createdAt: new Date(),
              },
            },
          },
        );
      }
    }

    await CommunityRequest.findByIdAndUpdate(request._id, {
      $set: {
        status: "linked",
        resolvedCommunityId: toObjectId(communityId),
        canonicalNameAtResolve: existing.name || request.requestedName,
        reviewedAt: new Date(),
        reviewedByUserId: req.user._id,
      },
    });

    return res.json({
      status: "linked",
      communityId: communityId,
      canonicalName: existing.name || request.requestedName,
    });
  } catch (err) {
    const status = err.status || 500;
    const error =
      status === 400 ? "BAD_REQUEST" : status === 404 ? "REQUEST_NOT_FOUND" : "INTERNAL_ERROR";
    return res.status(status).json({ error, message: err.message });
  }
});

// Reject request
router.post("/:id/reject", async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason || typeof reason !== "string") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "reason is required" });
    }
    const request = await loadRequest(req.params.id);
    await CommunityRequest.findByIdAndUpdate(request._id, {
      $set: {
        status: "rejected",
        rejectedReason: reason,
        reviewedAt: new Date(),
        reviewedByUserId: req.user._id,
      },
    });
    return res.json({ status: "rejected" });
  } catch (err) {
    const status = err.status || 500;
    const error =
      status === 400 ? "BAD_REQUEST" : status === 404 ? "REQUEST_NOT_FOUND" : "INTERNAL_ERROR";
    return res.status(status).json({ error, message: err.message });
  }
});

module.exports = router;
