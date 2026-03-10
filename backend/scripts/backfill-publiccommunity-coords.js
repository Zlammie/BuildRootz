require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { COMMUNITY_COLLECTION_CANDIDATES } = require("../../shared/communityResolver");

const HOME_COLLECTION_CANDIDATES = [
  "PublicHome",
  "PublicHomes",
  "publichomes",
  "publichome",
  "PublicHome_v2",
];

const BUILDER_IN_COMMUNITY_COLLECTION_CANDIDATES = [
  "BuilderInCommunity",
  "BuilderInCommunities",
  "builderincommunity",
  "builderincommunities",
];

const FALLBACK_COLLECTION_CANDIDATES = [
  "Community",
  "Communities",
  "community",
  "communities",
];

function parseArgs(argv) {
  const out = {
    dryRun: false,
    fallbackFile: "",
  };
  argv.forEach((arg) => {
    if (arg === "--dry-run") out.dryRun = true;
    if (arg.startsWith("--fallback-file=")) {
      out.fallbackFile = arg.slice("--fallback-file=".length).trim();
    }
  });
  return out;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isValidCoordinate(lat, lng) {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

function readCoordsFromDoc(doc) {
  const source = asObject(doc);
  const geo = asObject(source?.geo);
  const location = asObject(source?.location);
  const coordinates = asObject(source?.coordinates);
  const latCandidates = [source?.lat, geo?.lat, location?.lat, coordinates?.lat];
  const lngCandidates = [source?.lng, geo?.lng, location?.lng, coordinates?.lng];

  let lat = null;
  let lng = null;
  for (const value of latCandidates) {
    const num = toFiniteNumber(value);
    if (num !== null) {
      lat = num;
      break;
    }
  }
  for (const value of lngCandidates) {
    const num = toFiniteNumber(value);
    if (num !== null) {
      lng = num;
      break;
    }
  }
  if (!isValidCoordinate(lat, lng)) return null;
  return { lat, lng };
}

function buildFallbackKeys(doc) {
  const keys = [];
  const id = String(doc?._id || "").trim();
  const keepupCommunityId = typeof doc?.keepupCommunityId === "string" ? doc.keepupCommunityId.trim() : "";
  const canonicalKey = typeof doc?.canonicalKey === "string" ? doc.canonicalKey.trim().toLowerCase() : "";
  const slug = typeof doc?.slug === "string" ? doc.slug.trim().toLowerCase() : "";
  const name = typeof doc?.name === "string" ? doc.name.trim().toLowerCase() : "";
  const city = typeof doc?.city === "string" ? doc.city.trim().toLowerCase() : "";
  const state = typeof doc?.state === "string" ? doc.state.trim().toLowerCase() : "";
  if (id) keys.push(`id:${id}`);
  if (keepupCommunityId) keys.push(`keepupCommunityId:${keepupCommunityId}`);
  if (canonicalKey) keys.push(`canonicalKey:${canonicalKey}`);
  if (slug) keys.push(`slug:${slug}`);
  if (name && city && state) keys.push(`name:${name}::${city}::${state}`);
  return keys;
}

function loadFallbackMap(filePath) {
  if (!filePath) return new Map();
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(resolvedPath, "utf8");
  const parsed = JSON.parse(raw);
  const entries = asObject(parsed) ? Object.entries(parsed) : [];
  const map = new Map();
  entries.forEach(([key, value]) => {
    const coords = readCoordsFromDoc(value);
    if (coords) map.set(String(key), coords);
  });
  return map;
}

async function resolveCollection(db, candidates) {
  const names = (await db.listCollections().toArray()).map((collection) => collection.name);
  const found = candidates.find((name) => names.includes(name));
  return found ? db.collection(found) : null;
}

function buildFallbackFilter(doc) {
  const clauses = [];
  if (doc?._id instanceof mongoose.Types.ObjectId) clauses.push({ _id: doc._id });
  if (typeof doc?.keepupCommunityId === "string" && doc.keepupCommunityId.trim()) {
    const keepupCommunityId = doc.keepupCommunityId.trim();
    clauses.push({ keepupCommunityId });
    clauses.push({ communityId: keepupCommunityId });
  }
  if (typeof doc?.canonicalKey === "string" && doc.canonicalKey.trim()) {
    clauses.push({ canonicalKey: doc.canonicalKey.trim() });
  }
  if (typeof doc?.slug === "string" && doc.slug.trim()) {
    clauses.push({ slug: doc.slug.trim() });
  }
  if (
    typeof doc?.name === "string" &&
    doc.name.trim() &&
    typeof doc?.city === "string" &&
    doc.city.trim() &&
    typeof doc?.state === "string" &&
    doc.state.trim()
  ) {
    clauses.push({
      name: doc.name.trim(),
      city: doc.city.trim(),
      state: doc.state.trim(),
    });
  }
  return clauses.length ? { $or: clauses } : null;
}

async function resolveCoordsFromHomes(homeCollection, publicCommunityId) {
  if (!homeCollection || !(publicCommunityId instanceof mongoose.Types.ObjectId)) return null;
  const idString = publicCommunityId.toHexString();
  const rows = await homeCollection
    .find(
      {
        isActive: { $ne: false },
        publicCommunityId: { $in: [publicCommunityId, idString] },
      },
      {
        projection: {
          lat: 1,
          lng: 1,
          geo: 1,
          location: 1,
          coordinates: 1,
        },
      },
    )
    .toArray();

  let count = 0;
  let latSum = 0;
  let lngSum = 0;
  rows.forEach((row) => {
    const coords = readCoordsFromDoc(row);
    if (!coords) return;
    count += 1;
    latSum += coords.lat;
    lngSum += coords.lng;
  });
  if (!count) return null;
  return {
    lat: Number((latSum / count).toFixed(6)),
    lng: Number((lngSum / count).toFixed(6)),
    source: `home-centroid:${count}`,
  };
}

async function resolveCoordsFromFallbackCollections(db, communityDoc) {
  const filter = buildFallbackFilter(communityDoc);
  if (!filter) return null;

  for (const name of FALLBACK_COLLECTION_CANDIDATES) {
    if (name.toLowerCase() === "publiccommunity" || name.toLowerCase() === "publiccommunities") {
      continue;
    }
    let collection = null;
    try {
      collection = db.collection(name);
    } catch {
      collection = null;
    }
    if (!collection) continue;
    const exists = await db.listCollections({ name }).hasNext();
    if (!exists) continue;

    const row = await collection.findOne(
      filter,
      {
        projection: {
          lat: 1,
          lng: 1,
          geo: 1,
          location: 1,
          coordinates: 1,
        },
      },
    );
    const coords = readCoordsFromDoc(row);
    if (coords) {
      return { ...coords, source: `fallback:${name}` };
    }
  }
  return null;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const fallbackMap = loadFallbackMap(args.fallbackFile);
  const mongoUri = process.env.BUILDROOTZ_MONGODB_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Missing BUILDROOTZ_MONGODB_URI or MONGODB_URI");
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  if (!db) throw new Error("Mongo connection not ready");

  const communityCollection = await resolveCollection(db, COMMUNITY_COLLECTION_CANDIDATES);
  if (!communityCollection) {
    throw new Error("Public community collection not found");
  }
  const homeCollection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);
  const bicCollection = await resolveCollection(db, BUILDER_IN_COMMUNITY_COLLECTION_CANDIDATES);

  const mappedCommunityIds = new Set();
  if (bicCollection) {
    const distinctIds = await bicCollection.distinct("publicCommunityId", {});
    distinctIds.forEach((value) => {
      if (!value) return;
      if (value instanceof mongoose.Types.ObjectId) {
        mappedCommunityIds.add(value.toHexString());
        return;
      }
      mappedCommunityIds.add(String(value).trim());
    });
  }

  const docs = await communityCollection
    .find(
      {},
      {
        projection: {
          _id: 1,
          keepupCommunityId: 1,
          canonicalKey: 1,
          slug: 1,
          name: 1,
          city: 1,
          state: 1,
          lat: 1,
          lng: 1,
          location: 1,
          coordinates: 1,
        },
      },
    )
    .toArray();

  const targetDocs = mappedCommunityIds.size
    ? docs.filter((doc) => mappedCommunityIds.has(String(doc._id)))
    : docs;

  const summary = {
    totalCandidates: targetDocs.length,
    updated: 0,
    unchanged: 0,
    unresolved: 0,
    sourceCounts: {},
  };
  const unresolvedIds = [];

  for (const doc of targetDocs) {
    const existing = readCoordsFromDoc(doc);
    let resolved = existing ? { ...existing, source: "existing" } : null;

    if (!resolved) {
      resolved = await resolveCoordsFromHomes(homeCollection, doc._id);
    }

    if (!resolved && fallbackMap.size) {
      const fallbackKeys = buildFallbackKeys(doc);
      for (const key of fallbackKeys) {
        if (fallbackMap.has(key)) {
          const coords = fallbackMap.get(key);
          resolved = { ...coords, source: `fallback-file:${key}` };
          break;
        }
      }
    }

    if (!resolved) {
      resolved = await resolveCoordsFromFallbackCollections(db, doc);
    }

    if (!resolved || !isValidCoordinate(resolved.lat, resolved.lng)) {
      summary.unresolved += 1;
      unresolvedIds.push(String(doc._id));
      continue;
    }

    const normalized = {
      lat: Number(resolved.lat.toFixed(6)),
      lng: Number(resolved.lng.toFixed(6)),
    };
    const alreadySame =
      existing &&
      Number(existing.lat.toFixed(6)) === normalized.lat &&
      Number(existing.lng.toFixed(6)) === normalized.lng;

    if (alreadySame) {
      summary.unchanged += 1;
    } else {
      if (!args.dryRun) {
        await communityCollection.updateOne(
          { _id: doc._id },
          {
            $set: {
              lat: normalized.lat,
              lng: normalized.lng,
              location: normalized,
              coordinates: normalized,
              updatedAt: new Date(),
            },
          },
        );
      }
      summary.updated += 1;
    }
    summary.sourceCounts[resolved.source] = (summary.sourceCounts[resolved.source] || 0) + 1;
  }

  console.log("[backfill-publiccommunity-coords]", JSON.stringify({
    dryRun: args.dryRun,
    ...summary,
    unresolvedSample: unresolvedIds.slice(0, 20),
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("[backfill-publiccommunity-coords] failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exitCode = 1;
});
