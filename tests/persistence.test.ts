import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, rows } from "../src/lib/db";
import {
  board,
  createPlayer,
  dailyChallenge,
  maintainRounds,
  playerFor,
  submitPrediction,
} from "../src/lib/game";
const start = Math.floor((Date.now() - 600000) / 120000) * 120000;
let player: Awaited<ReturnType<typeof createPlayer>>;
beforeAll(async () => {
  process.env.ARENA_DATA_DIR = `.data/tests-${randomUUID()}`;
  delete process.env.DATABASE_URL;
  const db = await getDb();
  player = await createPlayer("IntegrationRacer", 0);
  await db.execute(
    sql`UPDATE feed SET installation='test-hardware',coverage_start=${start - 2400000},coverage_end=${Date.now()},caught_up=true,updated_at=${Date.now()} WHERE id=1`,
  );
  for (let i = 0; i < 16; i++) {
    const at = start - 2400000 + i * 120000;
    const segment = {
      segmentId: `seed-${i}`,
      continuityId: "test",
      discontinuity: false,
      startAt: new Date(at + 1000).toISOString(),
      endAt: new Date(at + 1000).toISOString(),
      workUnits: "1",
      provenance: "hardware",
      profile: "test-fixture",
      measurementEligible: true,
      observedAt: new Date(at + 1000).toISOString(),
      receivedAt: new Date(at + 1001).toISOString(),
      passages: [{ at: new Date(at + 1000).toISOString(), offsetNs: "0" }],
    };
    await db.execute(
      sql`INSERT INTO segments(id,payload,digest,start_at,end_at) VALUES(${segment.segmentId},${JSON.stringify(segment)}::jsonb,'fixture',${at + 1000},${at + 1000})`,
    );
  }
});
describe("real PostgreSQL persistence and scoring", () => {
  it("stores only a token hash and rejects a forged session", async () => {
    expect((await playerFor(player.token))?.id).toBe(player.player.id);
    expect(await playerFor("forged-token")).toBeNull();
    const stored = await rows<{ token_hash: string }>(
      await getDb(),
      sql`SELECT token_hash FROM players WHERE id=${player.player.id}`,
    );
    expect(stored[0].token_hash).not.toBe(player.token);
  });
  it("locks once, rejects duplicates and late predictions at server time", async () => {
    const db = await getDb();
    const lock = Date.now() + 60000;
    const id = "future-test";
    await db.execute(
      sql`INSERT INTO rounds(id,starts_at,ends_at,locks_at,thresholds,installation) VALUES(${id},${lock},${lock + 120000},${lock},'{"low":"0","high":"10","samples":12}'::jsonb,'test-hardware')`,
    );
    await submitPrediction(player.player, id, "cozy");
    await expect(submitPrediction(player.player, id, "zoom")).rejects.toThrow(
      "already locked",
    );
    const another = await createPlayer("LateRacer", 1);
    await db.execute(
      sql`UPDATE rounds SET locks_at=${Date.now() - 1} WHERE id=${id}`,
    );
    await expect(submitPrediction(another.player, id, "cozy")).rejects.toThrow(
      "closed",
    );
  });
  it("settles only complete eligible evidence, awards correctly and is idempotent", async () => {
    const db = await getDb();
    const wrong = await createPlayer("WrongRacer", 2);
    await db.execute(
      sql`INSERT INTO rounds(id,starts_at,ends_at,locks_at,thresholds,installation) VALUES('settle-test',${start},${start + 120000},${start},'{"low":"0","high":"10","samples":12}'::jsonb,'test-hardware')`,
    );
    await db.execute(
      sql`INSERT INTO predictions(id,player_id,round_id,choice,created_at) VALUES('right-test',${player.player.id},'settle-test','cozy',${start - 1}),('wrong-test',${wrong.player.id},'settle-test','zoom',${start - 1})`,
    );
    await maintainRounds();
    await maintainRounds();
    const awards = await rows<{ id: string; points: number }>(
      db,
      sql`SELECT id,points FROM awards WHERE round_id='settle-test' ORDER BY id`,
    );
    expect(awards).toEqual([
      { id: "right-test", points: 100 },
      { id: "wrong-test", points: 0 },
    ]);
    const round = await rows<{
      status: string;
      evidence: { certifiedCoreWork: boolean; rulesVersion: string };
    }>(db, sql`SELECT status,evidence FROM rounds WHERE id='settle-test'`);
    expect(round[0].status).toBe("settled");
    expect(round[0].evidence.certifiedCoreWork).toBe(false);
    expect(round[0].evidence.rulesVersion).toBe("passages-v1");
    expect((await board())[0].nickname).toBe("IntegrationRacer");
  });
  it("keeps incomplete rounds unscored", async () => {
    const db = await getDb();
    await db.execute(
      sql`INSERT INTO rounds(id,starts_at,ends_at,locks_at,thresholds,installation) VALUES('missing-test',${start - 3000000},${start - 2880000},${start - 3000000},'{"low":"0","high":"10","samples":12}'::jsonb,'test-hardware')`,
    );
    await maintainRounds();
    const result = await rows<{ status: string }>(
      db,
      sql`SELECT status FROM rounds WHERE id='missing-test'`,
    );
    expect(result[0].status).toBe("open");
  });
  it("daily participation is one award per player per UTC day", async () => {
    const challenge = await dailyChallenge(player.player);
    expect(challenge.completed).toBe(false);
    expect(challenge).not.toHaveProperty("work");
    const completed = await dailyChallenge(player.player, "cozy");
    expect(completed.completed).toBe(true);
    await expect(dailyChallenge(player.player, "zoom")).rejects.toThrow(
      "already",
    );
    const awards = await rows<{ points: number }>(
      await getDb(),
      sql`SELECT points FROM awards WHERE id LIKE ${`daily:${player.player.id}:%`}`,
    );
    expect(awards).toEqual([{ points: 25 }]);
  });
  it("rejects a daily answer for a different UTC date", async () => {
    await expect(
      dailyChallenge(player.player, "cozy", "1900-01-01"),
    ).rejects.toThrow("date changed");
  });
  it("disputed rounds disappear from ranked scores while audit records persist", async () => {
    const db = await getDb();
    await db.execute(
      sql`UPDATE rounds SET status='disputed' WHERE id='settle-test'`,
    );
    const leaders = await board();
    expect(leaders.find((p) => p.id === player.player.id)?.points).toBe(25);
    expect(
      await rows(db, sql`SELECT id FROM awards WHERE id='right-test'`),
    ).toHaveLength(1);
  });
});
