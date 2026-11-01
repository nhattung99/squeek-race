import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, locked, rows, type Executor } from "./db";
import { getWheel } from "./squeekchain";
import {
  advanceRace,
  newRace,
  queueRaceAction,
  raceStandings,
  TICK_MS,
  RACE_LENGTH,
  type RaceAction,
  type RaceState,
  type WheelContext,
} from "./race-engine";
type Player = { id: string; nickname: string; avatar: number };
type Stored = {
  id: string;
  player_id: string;
  created_at: string;
  starts_at: string;
  status: string;
  snapshot: RaceState;
};
export type MatchView = {
  id: string;
  serverNow: number;
  startsAt: number;
  status: "countdown" | "racing" | "finished";
  tick: number;
  sequence: number;
  seed: number;
  riders: ReturnType<typeof raceStandings>;
  wheel: WheelContext;
  resultDigest: string | null;
  version: string;
};
let schema: Promise<void> | undefined;
async function ensureSchema() {
  return (schema ??= (async () => {
    const db = await getDb();
    await db.execute(
      sql`CREATE TABLE IF NOT EXISTS race_matches(id text PRIMARY KEY,player_id text NOT NULL REFERENCES players(id),created_at bigint NOT NULL,starts_at bigint NOT NULL,status text NOT NULL,snapshot jsonb NOT NULL)`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS one_active_race ON race_matches(player_id) WHERE status IN ('countdown','racing')`,
    );
    await db.execute(
      sql`CREATE TABLE IF NOT EXISTS race_results(match_id text PRIMARY KEY REFERENCES race_matches(id),player_id text NOT NULL REFERENCES players(id),rank integer NOT NULL,finish_ms integer NOT NULL,hits integer NOT NULL,classification jsonb NOT NULL,evidence jsonb NOT NULL,digest text NOT NULL,finished_at bigint NOT NULL)`,
    );
  })());
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function raceReceiptDigest(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
async function persistAdvance(tx: Executor, row: Stored, now: number) {
  if (row.status === "finished") {
    const receipt = (
      await rows<{ digest: string }>(
        tx,
        sql`SELECT digest FROM race_results WHERE match_id=${row.id}`,
      )
    )[0];
    if (!receipt)
      throw new Error("Race result is missing; operator review required");
    return { row, resultDigest: receipt.digest };
  }
  const target = Math.max(
    0,
    Math.floor((now - Number(row.starts_at)) / TICK_MS),
  );
  const snapshot = advanceRace(row.snapshot, target);
  const finished = snapshot.riders.every((r) => r.finishMs !== null);
  const status = finished
    ? "finished"
    : now < Number(row.starts_at)
      ? "countdown"
      : "racing";
  await tx.execute(
    sql`UPDATE race_matches SET snapshot=${JSON.stringify(snapshot)}::jsonb,status=${status} WHERE id=${row.id}`,
  );
  let resultDigest: string | null = null;
  if (finished) {
    const classification = raceStandings(snapshot);
    const human = classification.find((r) => !r.ai)!;
    const evidence = {
      version: snapshot.version,
      seed: snapshot.seed,
      startsAt: Number(row.starts_at),
      inputs: snapshot.inputs,
      wheel: snapshot.wheel,
      authority: "server-simulation",
      opponents: "AI",
      length: RACE_LENGTH,
      receiptVersion: "canonical-json-sha256-v1",
    };
    resultDigest = raceReceiptDigest({ classification, evidence });
    await tx.execute(
      sql`INSERT INTO race_results(match_id,player_id,rank,finish_ms,hits,classification,evidence,digest,finished_at) VALUES(${row.id},${row.player_id},${human.rank},${human.finishMs!},${human.hits},${JSON.stringify(classification)}::jsonb,${JSON.stringify(evidence)}::jsonb,${resultDigest},${Number(row.starts_at) + snapshot.tick * TICK_MS}) ON CONFLICT(match_id) DO NOTHING`,
    );
  }
  return { row: { ...row, snapshot, status }, resultDigest };
}
function view(
  row: Stored,
  now: number,
  resultDigest: string | null,
): MatchView {
  return {
    id: row.id,
    serverNow: now,
    startsAt: Number(row.starts_at),
    status: row.status as MatchView["status"],
    tick: row.snapshot.tick,
    sequence: row.snapshot.sequence,
    seed: row.snapshot.seed,
    riders: raceStandings(row.snapshot),
    wheel: row.snapshot.wheel,
    resultDigest,
    version: row.snapshot.version,
  };
}
export async function createMatch(player: Player) {
  await ensureSchema();
  let wheel: WheelContext = {
    available: false,
    active: false,
    observedAt: null,
    installation: null,
    rpmMilli: null,
    energyPerTick: 25,
  };
  try {
    const source = await getWheel();
    if (source.fresh && source.measurement) {
      const m = source.measurement;
      const active = m.coreStatus === "ACTIVE";
      wheel = {
        available: true,
        active,
        observedAt: m.observedAt,
        installation: source.installationId,
        rpmMilli: m.rpmMilli,
        energyPerTick: active ? 35 : 25,
      };
    }
  } catch {
    /* Race remains playable with standard regeneration; never invent live data. */
  }
  return locked(async (tx) => {
    const now = Date.now();
    const active = (
      await rows<Stored>(
        tx,
        sql`SELECT * FROM race_matches WHERE player_id=${player.id} AND status IN ('countdown','racing')`,
      )
    )[0];
    if (active) {
      const advanced = await persistAdvance(tx, active, now);
      if (advanced.row.status !== "finished")
        return view(advanced.row, now, advanced.resultDigest);
    }
    const row: Stored = {
      id: randomUUID(),
      player_id: player.id,
      created_at: String(now),
      starts_at: String(now + 3000),
      status: "countdown",
      snapshot: newRace(
        randomBytes(4).readUInt32BE(),
        player.nickname,
        player.avatar,
        wheel,
      ),
    };
    await tx.execute(
      sql`INSERT INTO race_matches(id,player_id,created_at,starts_at,status,snapshot) VALUES(${row.id},${player.id},${now},${now + 3000},'countdown',${JSON.stringify(row.snapshot)}::jsonb)`,
    );
    return view(row, now, null);
  });
}
export async function readMatch(player: Player, id?: string) {
  await ensureSchema();
  return locked(async (tx) => {
    const row = (
      await rows<Stored>(
        tx,
        id
          ? sql`SELECT * FROM race_matches WHERE id=${id} AND player_id=${player.id}`
          : sql`SELECT * FROM race_matches WHERE player_id=${player.id} ORDER BY created_at DESC LIMIT 1`,
      )
    )[0];
    if (!row) {
      if (id) throw new Error("Race not found");
      return null;
    }
    const now = Date.now();
    const advanced = await persistAdvance(tx, row, now);
    return view(advanced.row, now, advanced.resultDigest);
  });
}
export async function controlMatch(
  player: Player,
  id: string,
  action: RaceAction,
  sequence: number,
) {
  await ensureSchema();
  return locked(async (tx) => {
    const row = (
      await rows<Stored>(
        tx,
        sql`SELECT * FROM race_matches WHERE id=${id} AND player_id=${player.id}`,
      )
    )[0];
    if (!row) throw new Error("Race not found");
    const now = Date.now();
    if (now < Number(row.starts_at)) throw new Error("Race has not started");
    const advanced = await persistAdvance(tx, row, now);
    if (advanced.row.status === "finished")
      return view(advanced.row, now, advanced.resultDigest);
    const snapshot = queueRaceAction(advanced.row.snapshot, action, sequence);
    await tx.execute(
      sql`UPDATE race_matches SET snapshot=${JSON.stringify(snapshot)}::jsonb WHERE id=${id}`,
    );
    return view({ ...advanced.row, snapshot }, now, null);
  });
}
export async function raceBoard() {
  await ensureSchema();
  const db = await getDb();
  return rows<{
    match_id: string;
    nickname: string;
    rank: number;
    finish_ms: number;
    hits: number;
    finished_at: string;
    digest: string;
  }>(
    db,
    sql`SELECT r.match_id,p.nickname,r.rank,r.finish_ms,r.hits,r.finished_at,r.digest FROM race_results r JOIN players p ON p.id=r.player_id ORDER BY r.rank ASC,r.finish_ms ASC,r.finished_at ASC,r.match_id ASC LIMIT 20`,
  );
}
