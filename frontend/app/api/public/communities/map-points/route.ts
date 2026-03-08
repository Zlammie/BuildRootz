import { NextResponse } from "next/server";
import { ObjectId, type Collection, type Db, type Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { resolveCollection } from "@/lib/publicData";

const COMMUNITY_COLLECTION_CANDIDATES = [
  "PublicCommunity",
  "PublicCommunities",
  "publiccommunities",
  "publiccommunity",
];

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

function toStringId(value: unknown): string {
  if (!value) return "";
  if (value instanceof ObjectId) return value.toHexString();
  return String(value).trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isValidCoordinate(lat: number | null, lng: number | null): lat is number {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function normalizeProductTypes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string") {
        return ((item as { label: string }).label || "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

async function resolveCollectionIfExists(
  db: Db,
  candidates: string[],
): Promise<Collection<Document> | null> {
  const names = await db.listCollections().toArray();
  const found = candidates.find((name) => names.some((collection) => collection.name === name));
  return found ? db.collection(found) : null;
}

type CommunityMapPoint = {
  id: string;
  name: string;
  slug?: string;
  city?: string;
  state?: string;
  lat: number;
  lng: number;
  inventoryCount: number;
  builderCount: number | null;
  planCount: number | null;
  productTypes: string[];
};

async function loadInventoryCounts(
  homeCollection: Collection<Document>,
): Promise<Record<string, number>> {
  const rows = await homeCollection
    .aggregate<{ _id: string; count: number }>([
      {
        $match: {
          isActive: true,
          publicCommunityId: { $exists: true, $ne: null },
        },
      },
      {
        $project: {
          communityId: { $toString: "$publicCommunityId" },
        },
      },
      {
        $group: {
          _id: "$communityId",
          count: { $sum: 1 },
        },
      },
    ])
    .toArray()
    .catch(() => []);

  const counts: Record<string, number> = {};
  rows.forEach((row) => {
    const id = toStringId(row._id).toLowerCase();
    if (!id) return;
    counts[id] = Number(row.count) || 0;
  });
  return counts;
}

async function loadBuilderCounts(
  db: Db,
): Promise<Record<string, number>> {
  const bicCollection = await resolveCollectionIfExists(db, BUILDER_IN_COMMUNITY_COLLECTION_CANDIDATES);
  if (!bicCollection) return {};

  const rows = await bicCollection
    .aggregate<{ _id: string; builderCount: number }>([
      {
        $match: {
          publicCommunityId: { $exists: true, $ne: null },
          $or: [
            { "visibility.isPublished": true },
            { "visibility.isPublished": { $exists: false } },
          ],
        },
      },
      {
        $project: {
          communityId: { $toString: "$publicCommunityId" },
          companyId: { $toString: "$companyId" },
        },
      },
      {
        $group: {
          _id: "$communityId",
          companies: { $addToSet: "$companyId" },
        },
      },
      {
        $project: {
          builderCount: {
            $size: {
              $filter: {
                input: "$companies",
                as: "companyId",
                cond: { $ne: ["$$companyId", ""] },
              },
            },
          },
        },
      },
    ])
    .toArray()
    .catch(() => []);

  const counts: Record<string, number> = {};
  rows.forEach((row) => {
    const id = toStringId(row._id).toLowerCase();
    if (!id) return;
    counts[id] = Number(row.builderCount) || 0;
  });
  return counts;
}

export async function GET() {
  try {
    const db = await getDb();
    const communityCollection = await resolveCollection(db, COMMUNITY_COLLECTION_CANDIDATES);
    const homeCollection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);

    const [inventoryCounts, builderCounts] = await Promise.all([
      loadInventoryCounts(homeCollection),
      loadBuilderCounts(db),
    ]);

    const communityDocs = await communityCollection
      .find(
        {
          $or: [
            { published: true },
            { isPublished: true },
            { publishedToBuildrootz: true },
            { visible: true },
            { isVisible: true },
            {
              published: { $exists: false },
              isPublished: { $exists: false },
              publishedToBuildrootz: { $exists: false },
              visible: { $exists: false },
              isVisible: { $exists: false },
            },
          ],
        },
        {
          projection: {
            name: 1,
            title: 1,
            communityName: 1,
            slug: 1,
            city: 1,
            state: 1,
            addressCity: 1,
            addressState: 1,
            location: 1,
            coordinates: 1,
            lat: 1,
            lng: 1,
            builders: 1,
            floorPlans: 1,
            planCatalogIds: 1,
            productTypes: 1,
            updatedAt: 1,
          } satisfies Document,
        },
      )
      .sort({ updatedAt: -1, _id: -1 })
      .toArray();

    const points: CommunityMapPoint[] = [];
    communityDocs.forEach((doc) => {
      const id = toStringId(doc._id);
      if (!id) return;

      const location = (doc.location as { lat?: unknown; lng?: unknown } | undefined) || {};
      const coordinates = (doc.coordinates as { lat?: unknown; lng?: unknown } | undefined) || {};
      const lat = toNumber(location.lat) ?? toNumber(coordinates.lat) ?? toNumber(doc.lat);
      const lng = toNumber(location.lng) ?? toNumber(coordinates.lng) ?? toNumber(doc.lng);
      if (!isValidCoordinate(lat, lng)) return;

      const communityId = id.toLowerCase();
      const builders = Array.isArray(doc.builders)
        ? doc.builders.map((item) => toStringId(item).toLowerCase()).filter(Boolean)
        : [];
      const floorPlans = Array.isArray(doc.floorPlans) ? doc.floorPlans : [];
      const planCatalogIds = Array.isArray(doc.planCatalogIds) ? doc.planCatalogIds : [];
      const productTypes = normalizeProductTypes(doc.productTypes);
      const builderCountFromDoc = builders.length ? new Set(builders).size : null;
      const builderCountFromBic =
        typeof builderCounts[communityId] === "number" ? builderCounts[communityId] : null;

      points.push({
        id,
        name:
          (typeof doc.name === "string" && doc.name.trim()) ||
          (typeof doc.title === "string" && doc.title.trim()) ||
          (typeof doc.communityName === "string" && doc.communityName.trim()) ||
          "Community",
        slug: typeof doc.slug === "string" ? doc.slug : undefined,
        city:
          (typeof doc.city === "string" && doc.city) ||
          (typeof doc.addressCity === "string" ? doc.addressCity : undefined),
        state:
          (typeof doc.state === "string" && doc.state) ||
          (typeof doc.addressState === "string" ? doc.addressState : undefined),
        lat,
        lng,
        inventoryCount: inventoryCounts[communityId] || 0,
        builderCount: builderCountFromBic ?? builderCountFromDoc,
        planCount: floorPlans.length || planCatalogIds.length || null,
        productTypes,
      });
    });

    const response = NextResponse.json({ ok: true, points });
    response.headers.set("Cache-Control", "public, max-age=60");
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "MAP_POINTS_FAILED",
        message: error instanceof Error ? error.message : "Failed to load community map points",
      },
      { status: 500 },
    );
  }
}
