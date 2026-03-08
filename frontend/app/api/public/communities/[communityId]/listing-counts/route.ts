import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { resolveCollection } from "@/lib/publicData";
import {
  buildCommunityListingCountsMatch,
  normalizeCompanyIdsForAggregation,
} from "../../../../../../../shared/communityListingCounts";

const HOME_COLLECTION_CANDIDATES = [
  "PublicHome",
  "PublicHomes",
  "publichomes",
  "publichome",
  "PublicHome_v2",
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const { communityId } = await params;
  if (!ObjectId.isValid(communityId)) {
    return NextResponse.json(
      { ok: false, error: "BAD_REQUEST", message: "communityId must be a valid ObjectId" },
      { status: 400 },
    );
  }

  try {
    const url = new URL(request.url);
    const companyIdsParam = url.searchParams.get("companyIds");
    const companyIds = companyIdsParam
      ? companyIdsParam.split(",").map((value) => value.trim()).filter(Boolean)
      : [];
    const normalizedCompanyIds = normalizeCompanyIdsForAggregation(companyIds);
    const companyObjectIds = normalizedCompanyIds.map((id) => new ObjectId(id));

    const db = await getDb();
    const collection = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);

    const match = buildCommunityListingCountsMatch({
      communityObjectId: new ObjectId(communityId),
      companyObjectIds,
      includeActiveOnly: true,
    });

    const rows = await collection
      .aggregate([
        { $match: match },
        { $group: { _id: "$companyId", count: { $sum: 1 } } },
      ])
      .toArray();

    const counts: Record<string, number> = {};
    rows.forEach((row) => {
      if (!row?._id) return;
      const companyId = row._id instanceof ObjectId ? row._id.toHexString() : String(row._id);
      counts[companyId] = Number(row.count) || 0;
    });

    // Manual verification:
    // 1) Publish homes for two companies in same community.
    // 2) GET this endpoint with and without companyIds filter.
    // 3) Verify counts match PublicHome docs where isActive=true.
    return NextResponse.json({
      ok: true,
      communityId,
      counts,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Failed to load listing counts",
      },
      { status: 500 },
    );
  }
}
