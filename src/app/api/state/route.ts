import { NextResponse } from "next/server";
import { gameState } from "@/lib/game";
import { currentPlayer, failure } from "@/lib/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    return NextResponse.json(await gameState(await currentPlayer()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
