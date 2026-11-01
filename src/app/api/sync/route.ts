import { NextRequest, NextResponse } from "next/server";
import { syncFeed } from "@/lib/game";
import { checkOrigin, failure, limitRequest } from "@/lib/http";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    await limitRequest(request, "sync", 30);
    await syncFeed();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await syncFeed();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
