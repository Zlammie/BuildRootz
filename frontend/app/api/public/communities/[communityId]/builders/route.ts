import { NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "../../../../../../lib/mongodb";
import { communityMatchClauses, resolveCollection } from "../../../../../../lib/publicData";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolvePublicCommunity, COMMUNITY_COLLECTION_CANDIDATES } = require("../../../../../../../shared/communityResolver");

const HOME_COLLECTION_CANDIDATES = [
  "PublicHome",
  "PublicHomes",
  "publichomes",
  "publichome",
  "PublicHome_v2",
  "Home",
  "Homes",
  "home",
  "homes",
];

async function ensureHomeIndexes(collection: any) {
  try {
    await collection.createIndexes([
      {
        key: {
          publicCommunityId: 1,
          keepupBuilderId: 1,
          published: 1,
          status: 1,
          generalStatus: 1,
          updatedAt: -1,
          createdAt: -1,
        },
        name: "publicCommunity_builder_status_published_updatedAt",
      },
      {
        key: {
          keepupCommunityId: 1,
          keepupBuilderId: 1,
          published: 1,
          status: 1,
          generalStatus: 1,
          updatedAt: -1,
          createdAt: -1,
        },
        name: "keepupCommunity_builder_status_published_updatedAt",
      },
    ]);
  } catch {
    // best effort
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  const { communityId: rawCommunityId } = await params;
  const communityId = rawCommunityId?.toString?.() || "";
  if (process.env.NODE_ENV === "development") {
    console.log("[builders endpoint] incoming community param:", communityId || "<empty>");
  }

  try {
    const db = await getDb();
    await resolveCollection(db, COMMUNITY_COLLECTION_CANDIDATES);
    const homeCol = await resolveCollection(db, HOME_COLLECTION_CANDIDATES);
    await ensureHomeIndexes(homeCol);

    const resolvedCommunity = await resolvePublicCommunity(db, communityId);
    if (!resolvedCommunity) {
      return NextResponse.json({ success: false, error: "Community not found" }, { status: 404 });
    }

    const resolvedCommunityId = resolvedCommunity._id;
    const resolvedCommunityOid =
      resolvedCommunityId && ObjectId.isValid(resolvedCommunityId) ? new ObjectId(resolvedCommunityId) : null;
    const resolvedKeepupId = resolvedCommunity.keepupCommunityId;
    const resolvedKeepupOid =
      resolvedKeepupId && ObjectId.isValid(resolvedKeepupId) ? new ObjectId(resolvedKeepupId) : null;
    const communityMatch = [
      ...communityMatchClauses(resolvedCommunityId),
      ...communityMatchClauses(resolvedKeepupId),
      ...communityMatchClauses(resolvedCommunity.slug),
    ].filter(Boolean) as Document[];

    const publishedOrActive: Document[] = [
      { published: true },
      { isPublished: true },
      { publishedToBuildrootz: true },
      { status: { $exists: true } },
      { generalStatus: { $exists: true } },
    ];

    const match: Document = {
      $and: [
        { $or: communityMatch },
        { $or: publishedOrActive },
      ],
    };

    const matchedCount = await homeCol.countDocuments(match).catch(() => 0);
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[builders endpoint] param:",
        communityId,
        "resolved _id:", resolvedCommunityId,
        "communityId:", resolvedKeepupId,
        "slug:", resolvedCommunity.slug,
        "matched homes:",
        matchedCount,
      );
    }

    const pipeline: Document[] = [
      { $match: match },
      {
        $addFields: {
          builderName: {
            $ifNull: [
              "$builder.name",
              "$builder",
              { $ifNull: ["$builderName", "$orgName"] },
            ],
          },
          builderSlug: {
            $ifNull: [
              "$builder.slug",
              "$slug",
            ],
          },
          builderKey: {
            $ifNull: [
              "$keepupBuilderId",
              "$builder.slug",
              "$builder.name",
              "$builderName",
              "unknown",
            ],
          },
          publishedFlag: {
            $cond: [
              {
                $or: [
                  { $eq: ["$published", true] },
                  { $eq: ["$isPublished", true] },
                  { $eq: ["$publishedToBuildrootz", true] },
                ],
              },
              1,
              0,
            ],
          },
          modelFlag: {
            $cond: [
              {
                $or: [
                  { $regexMatch: { input: { $ifNull: ["$status", ""] }, regex: /model/i } },
                  { $regexMatch: { input: { $ifNull: ["$generalStatus", ""] }, regex: /model/i } },
                ],
              },
              1,
              0,
            ],
          },
          updatedAtSafe: { $ifNull: ["$updatedAt", "$createdAt"] },
          addressSafe: {
            $ifNull: [
              "$modelAddress.street",
              {
                $ifNull: [
                  "$address.street",
                  {
                    $ifNull: [
                      "$address",
                      { $ifNull: ["$location.address", "$addressLine1"] },
                    ],
                  },
                ],
              },
            ],
          },
          priceSafe: {
            $ifNull: [
              "$price",
              {
                $ifNull: ["$salesPrice", "$listPrice"],
              },
            ],
          },
          sqftSafe: {
            $ifNull: [
              "$specs.sqft",
              "$sqft",
            ],
          },
          lotSizeSafe: {
            $ifNull: [
              "$lotSize",
              "$specs.lotSize",
            ],
          },
        },
      },
      {
        $sort: {
          modelFlag: -1,
          publishedFlag: -1,
          updatedAtSafe: -1,
          _id: -1,
        },
      },
      {
        $group: {
          _id: { builderKey: "$builderKey", builderName: "$builderName", builderSlug: "$builderSlug" },
          model: { $first: "$$ROOT" },
        },
      },
      {
        $project: {
          builderKey: {
            $cond: [{ $ifNull: ["$_id.builderKey", false] }, { $toString: "$_id.builderKey" }, "unknown"],
          },
          builderName: "$_id.builderName",
          builderSlug: "$_id.builderSlug",
          modelListing: {
            id: { $toString: "$model._id" },
            address: "$model.addressSafe",
            published: {
              $or: [
                { $eq: ["$model.published", true] },
                { $eq: ["$model.isPublished", true] },
                { $eq: ["$model.publishedToBuildrootz", true] },
              ],
            },
            updatedAt: { $ifNull: ["$model.updatedAt", "$model.createdAt"] },
            price: "$model.priceSafe",
            sqft: "$model.sqftSafe",
            lotSize: "$model.lotSizeSafe",
          },
        },
      },
    ];

    const builders = await homeCol.aggregate(pipeline, { allowDiskUse: false }).toArray();

    const response = NextResponse.json({ success: true, builders });
    response.headers.set("Cache-Control", "public, max-age=60");
    return response;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[builders endpoint] error", err);
    }
    return NextResponse.json({ success: false, error: "Failed to load builders" }, { status: 500 });
  }
}
