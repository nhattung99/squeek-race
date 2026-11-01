import { NextRequest, NextResponse } from "next/server";
import { predictionInput, rateLimit, submitPrediction } from "@/lib/game";
import { checkOrigin, failure, readBody, requirePlayer } from "@/lib/http";
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const player = await requirePlayer();
    await rateLimit(`predict:${player.id}`, 10);
    const input = predictionInput.parse(await readBody(request));
    await submitPrediction(player, input.roundId, input.choice);
    return NextResponse.json({ locked: true });
  } catch (e) {
    return failure(e);
  }
}
