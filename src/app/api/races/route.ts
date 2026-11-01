import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  checkOrigin,
  currentPlayer,
  failure,
  readBody,
  requirePlayer,
} from "@/lib/http";
import { rateLimit } from "@/lib/game";
import { controlMatch, createMatch, raceBoard, readMatch } from "@/lib/races";
const input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("start") }).strict(),
  z
    .object({
      kind: z.literal("control"),
      id: z.string().uuid(),
      action: z.enum(["left", "right", "boost"]),
      sequence: z.number().int().min(1).max(600),
    })
    .strict(),
]);
export async function GET(request: NextRequest) {
  try {
    const player = await currentPlayer();
    const id = request.nextUrl.searchParams.get("id") ?? undefined;
    if (id) z.string().uuid().parse(id);
    if (id && !player) throw new Error("Create a racer profile first");
    const match = player ? await readMatch(player, id) : null;
    return NextResponse.json(
      { match, leaderboard: await raceBoard() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const player = await requirePlayer();
    const body = input.parse(await readBody(request));
    await rateLimit(
      `races:${body.kind}:${player.id}`,
      body.kind === "start" ? 6 : 8,
      body.kind === "start" ? 60000 : 1000,
    );
    const match =
      body.kind === "start"
        ? await createMatch(player)
        : await controlMatch(player, body.id, body.action, body.sequence);
    return NextResponse.json(
      { match, leaderboard: await raceBoard() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
