import { NextResponse } from "next/server";
import { fetchPublicHomeById } from "../../../lib/publicData";

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
    return NextResponse.json({ success: false, error: "ids query parameter is required" }, { status: 400 });
  }

  const homes = (
    await Promise.all(
      ids.map(async (id) => {
        try {
          return await fetchPublicHomeById(id);
        } catch {
          return null;
        }
      }),
    )
  ).filter((h): h is NonNullable<typeof h> => Boolean(h));

  return NextResponse.json({ success: true, homes });
}
