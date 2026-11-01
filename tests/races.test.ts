import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, rows } from "../src/lib/db";
import { createPlayer, board } from "../src/lib/game";
import { advanceRace, newRace, raceStandings } from "../src/lib/race-engine";
vi.mock("../src/lib/squeekchain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/squeekchain")>();
  return {
    ...actual,
    getWheel: vi.fn().mockRejectedValue(new Error("offline-test")),
  };
});
import {
  controlMatch,
  createMatch,
  raceBoard,
  readMatch,
  raceReceiptDigest,
} from "../src/lib/races";
let player: Awaited<ReturnType<typeof createPlayer>>["player"];
let stranger: typeof player;
beforeAll(async () => {
  process.env.ARENA_DATA_DIR = `.data/tests-races-${randomUUID()}`;
  delete process.env.DATABASE_URL;
  await getDb();
  player = (await createPlayer("ServerRaceQA", 0)).player;
  stranger = (await createPlayer("OtherRaceQA", 1)).player;
});
afterEach(() => vi.restoreAllMocks());
describe("persisted server race lifecycle", () => {
  it("starts with server countdown, reuses an active match, and rejects early/foreign controls", async () => {
    const match = await createMatch(player);
    expect(match.status).toBe("countdown");
    expect((await createMatch(player)).id).toBe(match.id);
    await expect(controlMatch(player, match.id, "boost", 1)).rejects.toThrow(
      "not started",
    );
    await expect(readMatch(stranger, match.id)).rejects.toThrow("not found");
    await expect(controlMatch(stranger, match.id, "left", 1)).rejects.toThrow(
      "not found",
    );
  });
  it("persists a delayed input with server time and rejects invalid sequence", async () => {
    const match = (await readMatch(player))!;
    const time = vi.spyOn(Date, "now").mockReturnValue(match.startsAt + 1000);
    const controlled = await controlMatch(player, match.id, "left", 1);
    expect(controlled.sequence).toBe(1);
    const duplicate = await controlMatch(player, match.id, "left", 1);
    expect(duplicate.sequence).toBe(1);
    time.mockReturnValue(match.startsAt + 1200);
    const applied = (await readMatch(player, match.id))!;
    expect(applied.riders.find((r) => !r.ai)?.lane).toBe(0);
    await expect(controlMatch(player, match.id, "right", 99)).rejects.toThrow(
      "sequence",
    );
  });
  it("confirms finish/rank once, survives reads, and keeps prediction points separate", async () => {
    const match = (await readMatch(player))!;
    vi.spyOn(Date, "now").mockReturnValue(match.startsAt + 90000);
    const finished = (await readMatch(player, match.id))!;
    expect(finished.status).toBe("finished");
    expect(finished.resultDigest).toMatch(/^[a-f0-9]{64}$/);
    expect((await readMatch(player, match.id))?.resultDigest).toBe(
      finished.resultDigest,
    );
    const records = await rows<{
      classification: unknown;
      evidence: {
        seed: number;
        inputs: [];
        wheel: Parameters<typeof newRace>[3];
      };
      digest: string;
    }>(
      await getDb(),
      sql`SELECT classification,evidence,digest FROM race_results WHERE match_id=${match.id}`,
    );
    expect(records).toHaveLength(1);
    expect(await raceBoard()).toHaveLength(1);
    expect((await board()).find((p) => p.id === player.id)).toBeUndefined();
    const evidence = records[0].evidence;
    const reconstructed = advanceRace(
      {
        ...newRace(
          evidence.seed,
          player.nickname,
          player.avatar,
          evidence.wheel,
        ),
        inputs: evidence.inputs,
      },
      1800,
    );
    expect(reconstructed.riders.every((r) => r.finishMs !== null)).toBe(true);
    expect(raceStandings(reconstructed)).toEqual(records[0].classification);
    expect(
      raceReceiptDigest({
        classification: records[0].classification,
        evidence: records[0].evidence,
      }),
    ).toBe(records[0].digest);
  });
  it("restores the latest finished match and can start a new independent race", async () => {
    const latest = (await readMatch(player))!;
    expect(latest.status).toBe("finished");
    const next = await createMatch(player);
    expect(next.id).not.toBe(latest.id);
    expect(next.status).toBe("countdown");
    expect(next.riders.every((r) => r.distance === 0)).toBe(true);
  });
});
