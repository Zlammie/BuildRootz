import { NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { resolveCollection } from "@/lib/publicData";
import { mapPublicCommunityIdentitySummary } from "../../../../../../shared/publicCommunityIdentity";

const COMMUNITY_COLLECTION_CANDIDATES = [
  "PublicCommunity",
  "PublicCommunities",
  "publiccommunities",
  "publiccommunity",
];

function normalizeObjectIdList(raw: string | null): string[] {
  if (!raw) return [];
  const unique = new Set<string>();
  raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      if (!ObjectId.isValid(value)) return;
      unique.add(value.toLowerCase());
    });
  return Array.from(unique);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const communityIds = normalizeObjectIdList(searchParams.get("communityIds"));
    if (!communityIds.length) {
      const response = NextResponse.json({ ok: true, communities: [] });
      response.headers.set("Cache-Control", "public, max-age=60");
      return response;
    }

    const db = await getDb();
    const collection = await resolveCollection(db, COMMUNITY_COLLECTION_CANDIDATES);
    const objectIds = communityIds.map((id) => new ObjectId(id));

    const docs = await collection
      .find(
        { _id: { $in: objectIds } },
        {
          projection: {
            name: 1,
            slug: 1,
            city: 1,
            state: 1,
            heroImageUrl: 1,
            imageUrls: 1,
            highlights: 1,
            heroImage: 1,
            heroImages: { $slice: 3 },
            mapImage: 1,
            image: 1,
            images: { $slice: 3 },
            photos: { $slice: 3 },
          } satisfies Document,
        },
      )
      .toArray();

    // Manual test:
    // GET /api/public/communities/lookup?communityIds=<id1>,<id2>,bad-id
    // Expect only valid IDs queried and returned.
    const response = NextResponse.json({
      ok: true,
      communities: docs.map((doc) => {
        const summary = mapPublicCommunityIdentitySummary(doc);
        return {
          publicCommunityId:
            doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id),
          name: summary.name,
          slug: summary.slug,
          city: summary.city,
          state: summary.state,
          heroImageUrl: summary.heroImageUrl,
          imageUrlsPreview: summary.imageUrlsPreview,
          photosPreview: summary.photosPreview,
          highlights: summary.highlights,
        };
      }),
    });
    response.headers.set("Cache-Control", "public, max-age=60");
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "LOOKUP_FAILED",
        message: error instanceof Error ? error.message : "Failed to load communities",
      },
      { status: 500 },
    );
  }
}
