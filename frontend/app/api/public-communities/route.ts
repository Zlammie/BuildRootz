import { NextResponse } from "next/server";
import { fetchPublicCommunityById } from "../../../lib/publicData";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const ids = idsParam
    ? idsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

  if (!ids.length) {
    return NextResponse.json(
      { success: false, error: "ids query parameter is required" },
      { status: 400 },
    );
  }

  const communities = (
    await Promise.all(
      ids.map(async (id) => {
        try {
          return await fetchPublicCommunityById(id);
        } catch {
          return null;
        }
      }),
    )
  ).filter((c): c is NonNullable<typeof c> => Boolean(c));

  return NextResponse.json({ success: true, communities });
}
