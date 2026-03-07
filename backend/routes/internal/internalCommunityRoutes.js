const express = require("express");
const mongoose = require("mongoose");
// Internal, server-to-server only (KeepUp -> BuildRootz). Protected by x-api-key.
const internalApiKey = require("../../middleware/internalApiKey");
const {
  ensureCommunityIndexes,
  COMMUNITY_COLLECTION_CANDIDATES,
  computeCanonicalKey,
} = require("../../utils/communityResolver");
const { hasCommunityDetailsInput, normalizeCommunityDetails } = require("../../../shared/communityDetails");
const { normalizePublicSlug } = require("../../../shared/publicSlug");

const router = express.Router();

function normalizeName(s = "") {
  return s
    .toString()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(input = "") {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractAliasLabels(rawAliases) {
  if (!rawAliases) return [];
  if (Array.isArray(rawAliases)) {
    return rawAliases
      .map((item) => {
        if (!item) return null;
        if (typeof item === "string") return item;
        if (typeof item === "object" && item.label) return item.label;
        return null;
      })
      .filter(Boolean);
  }
  if (typeof rawAliases === "string") {
    return [rawAliases];
  }
  return [];
}

function computeMatchScore(candidate, query) {
  if (!candidate || !query) return 3;
  if (candidate === query) return 0;
  if (candidate.startsWith(query)) return 1;
  if (candidate.includes(query)) return 2;
  return 3;
}

async function getCommunityCollection(db) {
  if (!db) {
    throw new Error("Database unavailable");
  }
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  const found = COMMUNITY_COLLECTION_CANDIDATES.find((name) => names.includes(name));
  if (!found) {
    throw new Error("Community collection not found");
  }
  const col = db.collection(found);
  await ensureCommunityIndexes(col).catch(() => {});
  return col;
}

async function findCommunityById(db, id) {
  const col = await getCommunityCollection(db);
  const doc = await col
    .findOne({ _id: new mongoose.Types.ObjectId(id) }, { projection: { name: 1, city: 1, state: 1, aliases: 1 } })
    .catch(() => null);
  return doc;
}

router.use(internalApiKey);

router.post("/", async (req, res) => {
  try {
    const { name, city, state, slug, builder, market } = req.body || {};
    const normName = (name || "").toString().trim();
    const normCity = (city || "").toString().trim();
    const normState = (state || "").toString().trim();
    if (!normName || !normCity || !normState) {
      return res
        .status(400)
        .json({ error: "BAD_REQUEST", message: "name, city, and state are required" });
    }

    const db = mongoose.connection.db;
    const col = await getCommunityCollection(db);
    await ensureCommunityIndexes(col).catch(() => {});

    const canonicalKey = computeCanonicalKey({ name: normName, city: normCity, state: normState });
    if (!canonicalKey) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid canonical key" });
    }

    const existing = await col.findOne({ canonicalKey }).catch(() => null);
    if (existing) {
      return res.status(409).json({
        error: "COMMUNITY_ALREADY_EXISTS",
        communityId: existing._id?.toString?.() || existing._id,
        canonicalName: existing.name || normName,
        city: existing.city || normCity,
        state: existing.state || normState,
        slug: existing.slug || "",
      });
    }

    const desiredSlug = normalizePublicSlug(slug || normName);
    let finalSlug = desiredSlug;
    if (finalSlug) {
      let suffix = 1;
      // ensure slug uniqueness without race safety (best effort)
      while (await col.findOne({ slug: finalSlug })) {
        finalSlug = normalizePublicSlug(`${desiredSlug}-${suffix}`);
        suffix += 1;
      }
    }

    const doc = {
      name: normName,
      city: normCity,
      state: normState,
      canonicalKey,
      slug: finalSlug || undefined,
      ...(builder ? { builder } : {}),
      ...(market ? { market } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (hasCommunityDetailsInput(req.body || {})) {
      doc.communityDetails = normalizeCommunityDetails(req.body || {});
    }

    const insertResult = await col.insertOne(doc);
    const communityId = insertResult.insertedId?.toString?.() || insertResult.insertedId;

    return res.status(201).json({
      communityId,
      canonicalName: normName,
      city: normCity,
      state: normState,
      slug: doc.slug || "",
    });
  } catch (err) {
    console.error("[internal communities create]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/search", async (req, res) => {
  try {
    const q = (req.query?.q || "").toString().trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "q is required and must be at least 2 characters" });
    }

    const db = mongoose.connection.db;
    const col = await getCommunityCollection(db);
    const regex = new RegExp(escapeRegex(q), "i");
    const candidates = await col
      .find(
        {
          $or: [
            { name: regex },
            { aliases: regex },
            { "aliases.label": regex },
          ],
        },
        { projection: { name: 1, city: 1, state: 1, aliases: 1 } },
      )
      .limit(50)
      .toArray();

    const normalizedQuery = normalizeName(q);
    const scored = candidates.map((doc) => {
      const normalizedName = normalizeName(doc.name || "");
      const aliasLabels = extractAliasLabels(doc.aliases);
      const aliasScores = aliasLabels.map((a) => computeMatchScore(normalizeName(a), normalizedQuery));
      const bestAliasScore = aliasScores.length ? Math.min(...aliasScores) : 3;
      const score = Math.min(computeMatchScore(normalizedName, normalizedQuery), bestAliasScore);
      return { doc, score };
    });

    scored.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const aName = a.doc.name || "";
      const bName = b.doc.name || "";
      return aName.localeCompare(bName);
    });

    const results = scored.slice(0, 20).map(({ doc }) => ({
      _id: doc._id?.toString?.() || doc._id,
      name: doc.name || "",
      city: doc.city || "",
      state: doc.state || "",
    }));

    return res.json({ results });
  } catch (err) {
    if (err?.message === "Community collection not found") {
      return res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid community id" });
    }
    const db = mongoose.connection.db;
    const doc = await findCommunityById(db, id);
    if (!doc) {
      return res.status(404).json({ error: "COMMUNITY_NOT_FOUND" });
    }
    const aliases = extractAliasLabels(doc.aliases).map((label) => ({ label }));
    const payload = {
      _id: doc._id?.toString?.() || doc._id,
      name: doc.name || "",
      city: doc.city || "",
      state: doc.state || "",
      ...(aliases.length ? { aliases } : {}),
    };
    return res.json(payload);
  } catch (err) {
    if (err?.message === "Community collection not found") {
      return res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

router.post("/:id/validate-name", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid community id" });
    }
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "name is required" });
    }
    const db = mongoose.connection.db;
    const doc = await findCommunityById(db, id);
    if (!doc) {
      return res.status(404).json({ error: "COMMUNITY_NOT_FOUND" });
    }
    const normalizedInput = normalizeName(name);
    const canonicalName = doc.name || "";
    const canonicalNormalized = normalizeName(canonicalName);
    const aliasLabels = extractAliasLabels(doc.aliases);
    const aliasNormalized = aliasLabels.map(normalizeName).filter(Boolean);

    const ok =
      normalizedInput === canonicalNormalized ||
      aliasNormalized.includes(normalizedInput);

    if (ok) {
      return res.json({ ok: true, canonicalName });
    }
    const allowedExamples = [canonicalName, ...aliasLabels].filter(Boolean);
    return res.json({ ok: false, canonicalName, allowedExamples });
  } catch (err) {
    if (err?.message === "Community collection not found") {
      return res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

module.exports = router;
