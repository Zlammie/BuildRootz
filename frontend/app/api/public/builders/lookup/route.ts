import { NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { resolveCollection } from "@/lib/publicData";

const BUILDER_PROFILE_COLLECTION_CANDIDATES = [
  "BuilderProfile",
  "BuilderProfiles",
  "builderprofile",
  "builderprofiles",
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

function toIdString(value: unknown): string {
  if (!value) return "";
  if (value instanceof ObjectId) return value.toHexString();
  return String(value).trim();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyIds = normalizeObjectIdList(searchParams.get("companyIds"));
    if (!companyIds.length) {
      const response = NextResponse.json({ ok: true, builders: [] });
      response.headers.set("Cache-Control", "public, max-age=60");
      return response;
    }

    const db = await getDb();
    const collection = await resolveCollection(db, BUILDER_PROFILE_COLLECTION_CANDIDATES);
    const objectIds = companyIds.map((id) => new ObjectId(id));

    const docs = await collection
      .find(
        { companyId: { $in: [...objectIds, ...companyIds] } },
        {
          projection: {
            companyId: 1,
            builderName: 1,
            builderSlug: 1,
            logoUrl: 1,
            primaryColor: 1,
            secondaryColor: 1,
          } satisfies Document,
        },
      )
      .toArray();

    const deduped = new Map<
      string,
      {
        companyId: string;
        builderName?: string;
        builderSlug?: string;
        logoUrl?: string;
        primaryColor?: string;
        secondaryColor?: string;
      }
    >();
    docs.forEach((doc) => {
      const companyId = toIdString((doc as { companyId?: unknown }).companyId).toLowerCase();
      if (!companyId) return;
      if (deduped.has(companyId)) return;
      deduped.set(companyId, {
        companyId,
        builderName: (doc as { builderName?: string }).builderName,
        builderSlug: (doc as { builderSlug?: string }).builderSlug,
        logoUrl: (doc as { logoUrl?: string }).logoUrl,
        primaryColor: (doc as { primaryColor?: string }).primaryColor,
        secondaryColor: (doc as { secondaryColor?: string }).secondaryColor,
      });
    });

    // Manual test:
    // GET /api/public/builders/lookup?companyIds=<id1>,<id2>,bad-id
    // Expect only valid IDs queried and returned.
    const response = NextResponse.json({
      ok: true,
      builders: Array.from(deduped.values()),
    });
    response.headers.set("Cache-Control", "public, max-age=60");
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "LOOKUP_FAILED",
        message: error instanceof Error ? error.message : "Failed to load builders",
      },
      { status: 500 },
    );
  }
}
