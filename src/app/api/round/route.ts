import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, rows } from "@/lib/db";
import type { Round } from "@/lib/game";
import { failure, requirePlayer } from "@/lib/http";
import type { Segment } from "@/lib/squeekchain";
export async function GET(request: NextRequest) {
  try {
    const player = await requirePlayer();
    const id = request.nextUrl.searchParams.get("id");
    if (!id || id.length > 200) throw new Error("Invalid round");
    const db = await getDb();
    const prediction = (
      await rows<{
        choice: string;
        points: number | null;
        correct: boolean | null;
      }>(
        db,
        sql`SELECT p.choice,CASE WHEN r.status='settled' THEN a.points END points,CASE WHEN r.status='settled' THEN a.correct END correct FROM predictions p JOIN rounds r ON r.id=p.round_id LEFT JOIN awards a ON a.id=p.id WHERE p.player_id=${player.id} AND p.round_id=${id}`,
      )
    )[0];
    if (!prediction) throw new Error("Prediction not found");
    const round = (
      await rows<Round>(db, sql`SELECT * FROM rounds WHERE id=${id}`)
    )[0];
    const timeline = Array.from({ length: 24 }, () => 0);
    if (round.status === "settled") {
      const segments = await rows<{ payload: Segment }>(
        db,
        sql`SELECT payload FROM segments WHERE end_at>=${round.starts_at} AND start_at<${round.ends_at}`,
      );
      for (const { payload } of segments)
        for (const p of payload.passages) {
          const offset = Date.parse(p.at) - Number(round.starts_at);
          if (offset >= 0 && offset < 120000)
            timeline[Math.floor(offset / 5000)]++;
        }
    }
    return NextResponse.json(
      { round, prediction, timeline },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
