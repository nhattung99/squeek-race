import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, locked, rows, type Executor } from "./db";
import {
  API_BASE,
  apiGet,
  getWheel,
  runsSchema,
  type Segment,
} from "./squeekchain";
import {
  assertPrediction,
  calibrate,
  classify,
  leaderboardOrder,
  measureWindow,
  nextWindow,
  score,
  WINDOW_MS,
  type Choice,
  type Thresholds,
} from "./rules";

type Feed = {
  installation: string | null;
  cursor: string | null;
  coverage_start: string | null;
  coverage_end: string | null;
  updated_at: string | null;
  caught_up: boolean;
  halted: string | null;
};
export type Round = {
  id: string;
  starts_at: string;
  ends_at: string;
  locks_at: string;
  thresholds: Thresholds;
  installation: string;
  status: string;
  work: string | null;
  outcome: Choice | null;
  evidence: unknown;
  settled_at: string | null;
};
type Player = { id: string; nickname: string; avatar: number };
type Prediction = {
  id: string;
  player_id: string;
  round_id: string;
  choice: Choice;
  created_at: string;
};
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function rateLimit(key: string, max: number, period = 60_000) {
  return locked(async (tx) => {
    const now = Date.now();
    const result = await rows<{ hits: number }>(
      tx,
      sql`INSERT INTO limits(key,hits,expires) VALUES(${key},1,${now + period}) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN limits.expires<${now} THEN 1 ELSE limits.hits+1 END, expires=CASE WHEN limits.expires<${now} THEN ${now + period} ELSE limits.expires END RETURNING hits`,
    );
    if (result[0].hits > max)
      throw new Error("Too many requests. Try again later.");
  });
}
export async function playerFor(token: string | undefined) {
  if (!token) return null;
  const db = await getDb();
  return (
    (
      await rows<Player>(
        db,
        sql`SELECT id,nickname,avatar FROM players WHERE token_hash=${hash(token)} AND created_at>${Date.now() - 90 * 86400000}`,
      )
    )[0] ?? null
  );
}
export async function createPlayer(nickname: string, avatar: number) {
  const token = randomBytes(32).toString("hex");
  const id = randomUUID();
  const db = await getDb();
  await db.execute(
    sql`INSERT INTO players(id,token_hash,nickname,avatar,created_at) VALUES(${id},${hash(token)},${nickname},${avatar},${Date.now()})`,
  );
  return { token, player: { id, nickname, avatar } };
}
async function feedFor(tx: Executor) {
  return (await rows<Feed>(tx, sql`SELECT * FROM feed WHERE id=1`))[0];
}
async function segmentsFor(tx: Executor, start: number, end: number) {
  return (
    await rows<{ payload: Segment }>(
      tx,
      sql`SELECT payload FROM segments WHERE end_at>=${start} AND start_at<${end} ORDER BY start_at`,
    )
  ).map((r) => r.payload);
}
export async function historyWindows(
  tx: Executor,
  feed: Feed,
  now = Date.now(),
) {
  if (!feed.coverage_start || !feed.coverage_end) return [];
  const end =
    Math.floor(Math.min(Number(feed.coverage_end), now - 120_000) / WINDOW_MS) *
    WINDOW_MS;
  const start = Math.max(
    Math.ceil(Number(feed.coverage_start) / WINDOW_MS) * WINDOW_MS,
    end - 240 * WINDOW_MS,
  );
  const segments = await segmentsFor(tx, start, end);
  const windows: { start: number; end: number; work: string }[] = [];
  for (let at = start; at + WINDOW_MS <= end; at += WINDOW_MS) {
    try {
      const m = measureWindow(
        segments,
        at,
        at + WINDOW_MS,
        Number(feed.coverage_start),
        Number(feed.coverage_end),
      );
      windows.push({ start: at, end: at + WINDOW_MS, work: m.work });
    } catch {
      /* Ineligible intervals are omitted, never scored as zero. */
    }
  }
  return windows;
}
let syncing: Promise<void> | undefined;
export function syncFeed(): Promise<void> {
  return (syncing ??= (async () => {
    const db = await getDb();
    let feed = await feedFor(db);
    if (feed.halted) throw new Error(feed.halted);
    if (feed.updated_at && Date.now() - Number(feed.updated_at) < 10_000)
      return;
    for (let page = 0; page < 6; page++) {
      const response = await apiGet(
        `/measurement/runs?limit=100${feed.cursor ? `&cursor=${encodeURIComponent(feed.cursor)}` : ""}`,
        runsSchema,
        0,
      );
      await locked(async (tx) => {
        const current = await feedFor(tx);
        if (current.cursor !== feed.cursor)
          throw new Error("Feed advanced; retry");
        if (
          current.installation &&
          current.installation !== response.installationId
        )
          throw new Error("Installation changed; operator review required");
        for (const segment of response.items) {
          const digest = hash(JSON.stringify(segment));
          const prior = (
            await rows<{ digest: string }>(
              tx,
              sql`SELECT digest FROM segments WHERE id=${segment.segmentId}`,
            )
          )[0];
          if (prior && prior.digest !== digest)
            throw new Error(
              "Source correction detected; scoring paused for review",
            );
          await tx.execute(
            sql`INSERT INTO segments(id,payload,digest,start_at,end_at) VALUES(${segment.segmentId},${JSON.stringify(segment)}::jsonb,${digest},${Date.parse(segment.startAt)},${Date.parse(segment.endAt)}) ON CONFLICT DO NOTHING`,
          );
        }
        const caught = response.items.length === 0;
        // A nonempty page does not prove coverage through the head; follow its cursor first.
        const end = caught
          ? response.coverageThroughAt
          : response.items.at(-1)?.endAt;
        const cursor = response.nextCursor ?? feed.cursor;
        await tx.execute(
          sql`UPDATE feed SET installation=${response.installationId},cursor=${cursor},coverage_start=${response.coverageStartAt ? Date.parse(response.coverageStartAt) : null},coverage_end=${end ? Date.parse(end) : null},updated_at=${Date.now()},caught_up=${caught && response.freshness === "fresh"} WHERE id=1`,
        );
      });
      feed = await feedFor(db);
      if (response.items.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 550));
    }
    await maintainRounds();
  })()
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : "Sync failed";
      if (
        message.includes("correction") ||
        message.includes("Installation changed")
      ) {
        await locked(async (tx) => {
          await tx.execute(
            sql`UPDATE feed SET halted=${message},caught_up=false WHERE id=1`,
          );
          await tx.execute(
            sql`UPDATE rounds SET status='disputed' WHERE status='settled'`,
          );
          await tx.execute(
            sql`INSERT INTO audit(id,kind,detail,created_at) VALUES(${randomUUID()},'source_dispute',${JSON.stringify({ message })}::jsonb,${Date.now()})`,
          );
        });
      }
      throw error;
    })
    .finally(() => {
      syncing = undefined;
    }));
}
export async function maintainRounds() {
  await locked(async (tx) => {
    const feed = await feedFor(tx);
    const now = Date.now();
    if (feed.halted) return;
    const open = await rows<Round>(
      tx,
      sql`SELECT * FROM rounds WHERE status='open' ORDER BY starts_at`,
    );
    for (const round of open) {
      if (
        Number(round.ends_at) + 120_000 > now ||
        !feed.coverage_end ||
        Number(feed.coverage_end) < Number(round.ends_at)
      )
        continue;
      if (round.installation !== feed.installation) continue;
      // Earlier unresolvable rounds cannot be overtaken: streak ordering is deterministic.
      try {
        const segments = await segmentsFor(
          tx,
          Number(round.starts_at),
          Number(round.ends_at),
        );
        const measured = measureWindow(
          segments,
          Number(round.starts_at),
          Number(round.ends_at),
          Number(feed.coverage_start),
          Number(feed.coverage_end),
        );
        const outcome = classify(measured.work, round.thresholds);
        const evidence = {
          authority: "pi-device-key",
          certifiedCoreWork: false,
          source: `${API_BASE}/measurement/runs`,
          installation: feed.installation,
          coverageThroughAt: Number(feed.coverage_end),
          retrievedAt: now,
          segmentIds: measured.segmentIds,
          sha256: hash(JSON.stringify(segments)),
          rulesVersion: "passages-v1",
          interval: "[start,end)",
        };
        await tx.execute(
          sql`UPDATE rounds SET status='settled',work=${measured.work},outcome=${outcome},evidence=${JSON.stringify(evidence)}::jsonb,settled_at=${now} WHERE id=${round.id} AND status='open'`,
        );
        const predictions = await rows<Prediction>(
          tx,
          sql`SELECT * FROM predictions WHERE round_id=${round.id}`,
        );
        for (const prediction of predictions) {
          const past = await rows<{ correct: boolean }>(
            tx,
            sql`SELECT correct FROM awards WHERE player_id=${prediction.player_id} AND correct IS NOT NULL ORDER BY created_at DESC,id DESC`,
          );
          let streak = 0;
          for (const item of past) {
            if (!item.correct) break;
            streak++;
          }
          const correct = prediction.choice === outcome;
          const award = score(correct, streak);
          await tx.execute(
            sql`INSERT INTO awards(id,player_id,round_id,points,correct,created_at) VALUES(${prediction.id},${prediction.player_id},${round.id},${award.points},${correct},${Number(round.ends_at)}) ON CONFLICT DO NOTHING`,
          );
        }
      } catch {
        break;
      }
    }
    if (
      !feed.caught_up ||
      !feed.coverage_end ||
      now - Number(feed.coverage_end) > 120_000
    )
      return;
    const windows = await historyWindows(tx, feed, now);
    let thresholds: Thresholds;
    try {
      thresholds = calibrate(windows.map((w) => w.work));
    } catch {
      return;
    }
    const next = nextWindow(now);
    const id = `${feed.installation}:${next.start}`;
    await tx.execute(
      sql`INSERT INTO rounds(id,starts_at,ends_at,locks_at,thresholds,installation) VALUES(${id},${next.start},${next.end},${next.lock},${JSON.stringify(thresholds)}::jsonb,${feed.installation}) ON CONFLICT DO NOTHING`,
    );
  });
}
export async function submitPrediction(
  player: Player,
  roundId: string,
  choice: Choice,
) {
  await locked(async (tx) => {
    const round = (
      await rows<Round>(tx, sql`SELECT * FROM rounds WHERE id=${roundId}`)
    )[0];
    if (!round || round.status !== "open") throw new Error("Round unavailable");
    const existing = await rows(
      tx,
      sql`SELECT id FROM predictions WHERE player_id=${player.id} AND round_id=${roundId}`,
    );
    const feed = await feedFor(tx);
    if (
      feed.halted ||
      !feed.caught_up ||
      Date.now() - Number(feed.coverage_end) > 120_000
    )
      throw new Error("Hardware feed is stale; predictions paused");
    const acceptedAt = Date.now();
    assertPrediction(acceptedAt, Number(round.locks_at), existing.length > 0);
    await tx.execute(
      sql`INSERT INTO predictions(id,player_id,round_id,choice,created_at) VALUES(${randomUUID()},${player.id},${roundId},${choice},${acceptedAt})`,
    );
  });
}
export async function board() {
  const db = await getDb();
  const list = await rows<
    Player & { points: number; correct: number; total: number }
  >(
    db,
    sql`SELECT p.id,p.nickname,p.avatar,COALESCE(SUM(a.points),0)::integer points,COUNT(a.id) FILTER(WHERE a.correct=true)::integer correct,COUNT(a.id) FILTER(WHERE a.correct IS NOT NULL)::integer total FROM players p LEFT JOIN awards a ON a.player_id=p.id AND (a.round_id IS NULL OR EXISTS(SELECT 1 FROM rounds r WHERE r.id=a.round_id AND r.status='settled')) GROUP BY p.id HAVING COUNT(a.id)>0`,
  );
  return list.sort(leaderboardOrder).slice(0, 100);
}
export async function gameState(player: Player | null) {
  const db = await getDb();
  const feed = await feedFor(db);
  const rounds = await rows<Round>(
    db,
    sql`SELECT * FROM rounds ORDER BY starts_at DESC LIMIT 30`,
  );
  const predictions = player
    ? await rows<
        Prediction & { points: number | null; correct: boolean | null }
      >(
        db,
        sql`SELECT p.*,a.points,a.correct FROM predictions p LEFT JOIN awards a ON a.id=p.id AND EXISTS(SELECT 1 FROM rounds r WHERE r.id=a.round_id AND r.status='settled') WHERE p.player_id=${player.id} ORDER BY p.created_at DESC LIMIT 100`,
      )
    : [];
  let wheel: Awaited<ReturnType<typeof getWheel>> | null = null;
  let sourceError: string | null = null;
  try {
    wheel = await getWheel();
  } catch (e) {
    sourceError = e instanceof Error ? e.message : "Source unavailable";
  }
  const awards = player
    ? await rows<{ points: number; correct: boolean | null }>(
        db,
        sql`SELECT points,correct FROM awards a WHERE player_id=${player.id} AND (round_id IS NULL OR EXISTS(SELECT 1 FROM rounds r WHERE r.id=a.round_id AND r.status='settled')) ORDER BY created_at DESC,id DESC`,
      )
    : [];
  let streak = 0;
  for (const a of awards.filter((a) => a.correct !== null)) {
    if (!a.correct) break;
    streak++;
  }
  return {
    serverNow: Date.now(),
    player,
    feed,
    rounds,
    predictions,
    wheel,
    sourceError,
    leaderboard: await board(),
    profile: {
      points: awards.reduce((n, a) => n + a.points, 0),
      correct: awards.filter((a) => a.correct).length,
      total: awards.filter((a) => a.correct !== null).length,
      streak,
    },
  };
}
export async function dailyChallenge(
  player: Player,
  answer?: Choice,
  expectedDay?: string,
) {
  return locked(async (tx) => {
    const day = new Date().toISOString().slice(0, 10);
    if (expectedDay && expectedDay !== day)
      throw new Error("Daily challenge date changed; reopen today�s challenge");
    let record = (
      await rows<{
        challenge: {
          start: number;
          end: number;
          work: string;
          thresholds: Thresholds;
          answer: Choice;
        };
        answer: string | null;
      }>(
        tx,
        sql`SELECT challenge,answer FROM daily WHERE player_id=${player.id} AND day=${day}`,
      )
    )[0];
    if (!record) {
      const feed = await feedFor(tx);
      const windows = await historyWindows(tx, feed);
      const thresholds = calibrate(windows.map((w) => w.work));
      const candidates = windows.filter((w) => BigInt(w.work) > 0n);
      if (!candidates.length)
        throw new Error("Hardware history is synchronizing");
      const window =
        candidates[parseInt(hash(day).slice(0, 8), 16) % candidates.length];
      const challenge = {
        ...window,
        thresholds,
        answer: classify(window.work, thresholds),
      };
      await tx.execute(
        sql`INSERT INTO daily(player_id,day,challenge) VALUES(${player.id},${day},${JSON.stringify(challenge)}::jsonb)`,
      );
      record = { challenge, answer: null };
    }
    if (answer) {
      if (record.answer) throw new Error("Daily challenge already completed");
      await tx.execute(
        sql`UPDATE daily SET answer=${answer} WHERE player_id=${player.id} AND day=${day}`,
      );
      // Historical challenge is educational; answers are public, so only participation earns points.
      await tx.execute(
        sql`INSERT INTO awards(id,player_id,points,correct,created_at) VALUES(${`daily:${player.id}:${day}`},${player.id},25,NULL,${Date.now()}) ON CONFLICT DO NOTHING`,
      );
      record.answer = answer;
    }
    return {
      day,
      start: record.challenge.start,
      end: record.challenge.end,
      thresholds: record.challenge.thresholds,
      completed: !!record.answer,
      ...(record.answer
        ? {
            work: record.challenge.work,
            outcome: record.challenge.answer,
            correct: record.answer === record.challenge.answer,
          }
        : {}),
    };
  });
}
export const playerInput = z
  .object({
    nickname: z
      .string()
      .trim()
      .min(2)
      .max(20)
      .regex(/^[\p{L}\p{N} _-]+$/u),
    avatar: z.number().int().min(0).max(3),
  })
  .strict();
export const predictionInput = z
  .object({
    roundId: z.string().min(1).max(200),
    choice: z.enum(["cozy", "cruise", "zoom"]),
  })
  .strict();
