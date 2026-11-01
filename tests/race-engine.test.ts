import { describe, expect, it } from "vitest";
import {
  advanceRace,
  applyRaceAction,
  newRace,
  queueRaceAction,
  raceCourse,
  raceStandings,
  RACE_LENGTH,
  type WheelContext,
} from "../src/lib/race-engine";
const wheel: WheelContext = {
  available: false,
  active: false,
  observedAt: null,
  installation: null,
  rpmMilli: null,
  energyPerTick: 25,
};
describe("authoritative race physics", () => {
  it("creates one human and two explicitly AI racers on a seeded course", () => {
    const state = newRace(42, "Test", 0, wheel);
    expect(state.riders.filter((r) => r.ai)).toHaveLength(2);
    expect(raceCourse(42)).toEqual(raceCourse(42));
    expect(raceCourse(43)).not.toEqual(raceCourse(42));
  });
  it("advances by fixed server ticks, never moves backwards in time", () => {
    const state = advanceRace(newRace(42, "Test", 0, wheel), 20);
    expect(state.riders[0].distance).toBeGreaterThan(0);
    expect(advanceRace(state, 2)).toEqual(state);
  });
  it("applies controls once and limits impossible lane/energy changes", () => {
    let state = queueRaceAction(newRace(42, "Test", 0, wheel), "left", 1);
    expect(queueRaceAction(state, "left", 1)).toEqual(state);
    expect(() => queueRaceAction(state, "right", 2)).toThrow("too fast");
    state = advanceRace(state, 4);
    expect(state.riders[0].lane).toBe(0);
    state = queueRaceAction(state, "boost", 2);
    expect(advanceRace(state, 5).riders[0].energy).toBeLessThan(10000);
    expect(() => queueRaceAction(state, "left", 8)).toThrow("sequence");
  });
  it("hits obstacles only when crossing them in the matching lane", () => {
    const state = newRace(11, "Test", 0, wheel);
    const item = raceCourse(11).find((i) => i.kind === "obstacle")!;
    state.riders[0].distance = item.at - 1;
    state.riders[0].lane = item.lane;
    const next = advanceRace(state, 1);
    expect(next.riders[0].hits).toBe(1);
    expect(next.riders[0].penalty).toBe(30);
  });
  it("reproduces results from seed, frozen wheel context and timestamped input log", () => {
    const original = newRace(53, "Test", 0, wheel);
    let played = queueRaceAction(original, "left", 1);
    played = advanceRace(played, 30);
    played = queueRaceAction(played, "boost", 2);
    played = advanceRace(played, 1800);
    const replay = advanceRace(
      { ...original, sequence: played.sequence, inputs: played.inputs },
      1800,
    );
    expect(replay).toEqual(played);
    expect(
      played.riders.every(
        (r) => r.distance === RACE_LENGTH && r.finishMs !== null,
      ),
    ).toBe(true);
    const sorted = raceStandings(played);
    expect(sorted[0].finishMs).toBeLessThanOrEqual(sorted[2].finishMs!);
  });
  it("does not spend energy twice while boost is active", () => {
    const rider = newRace(8, "Test", 0, wheel).riders[0];
    applyRaceAction(rider, "boost");
    applyRaceAction(rider, "boost");
    expect(rider.energy).toBe(6500);
  });
});
