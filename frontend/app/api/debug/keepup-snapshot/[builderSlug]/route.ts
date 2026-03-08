import { NextResponse } from "next/server";
import { fetchBuilderSnapshot, KeepupPublicFetchError } from "../../../../../../services/keepupPublicClient";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ builderSlug: string }> },
) {
  if (process.env.ENABLE_KEEPUP_SNAPSHOT_DEBUG !== "1") {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const { builderSlug } = await params;
  if (!builderSlug) {
    return NextResponse.json({ success: false, error: "builderSlug is required" }, { status: 400 });
  }

  try {
    const snapshot = await fetchBuilderSnapshot(builderSlug);
    if (!snapshot) {
      return NextResponse.json({ success: false, error: "Snapshot not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, snapshot });
  } catch (err) {
    if (err instanceof KeepupPublicFetchError) {
      return NextResponse.json(
        { success: false, error: err.message, status: err.status },
        { status: err.status >= 400 ? err.status : 500 },
      );
    }
    return NextResponse.json({ success: false, error: "Snapshot debug failed" }, { status: 500 });
  }
}
