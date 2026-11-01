import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dailyChallenge, rateLimit } from "@/lib/game";
import { checkOrigin, failure, readBody, requirePlayer } from "@/lib/http";
export async function GET() {
  try {
    return NextResponse.json(await dailyChallenge(await requirePlayer()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const player = await requirePlayer();
    await rateLimit(`daily:${player.id}`, 5);
    const input = z
      .object({
        choice: z.enum(["cozy", "cruise", "zoom"]),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .strict()
      .parse(await readBody(request));
    return NextResponse.json(
      await dailyChallenge(player, input.choice, input.day),
    );
  } catch (e) {
    return failure(e);
  }
}
