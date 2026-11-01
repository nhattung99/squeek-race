export const RACE_VERSION = "arena-race-v1";
export const RACE_LENGTH = 1_000_000; // milli game metres; never physical wheel distance
export const TICK_MS = 50;
export type RaceAction = "left" | "right" | "boost";
export type RaceInput = { tick: number; sequence: number; action: RaceAction };
export type RaceItem = {
  id: number;
  at: number;
  lane: number;
  kind: "energy" | "obstacle";
};
export type Rider = {
  id: string;
  name: string;
  ai: boolean;
  avatar: number;
  lane: number;
  distance: number;
  energy: number;
  boost: number;
  penalty: number;
  hits: number;
  finishMs: number | null;
};
export type WheelContext = {
  available: boolean;
  active: boolean;
  observedAt: string | null;
  installation: string | null;
  rpmMilli: number | null;
  energyPerTick: number;
};
export type RaceState = {
  version: typeof RACE_VERSION;
  seed: number;
  tick: number;
  sequence: number;
  inputs: RaceInput[];
  riders: Rider[];
  wheel: WheelContext;
};
function rng(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}
export function raceCourse(seed: number): RaceItem[] {
  const next = rng(seed);
  return Array.from({ length: 36 }, (_, i) => ({
    id: i,
    at: (65 + i * 24) * 1000,
    lane: next() % 3,
    kind: next() % 5 === 0 ? "energy" : "obstacle",
  }));
}
export function newRace(
  seed: number,
  name: string,
  avatar: number,
  wheel: WheelContext,
): RaceState {
  return {
    version: RACE_VERSION,
    seed,
    tick: 0,
    sequence: 0,
    inputs: [],
    wheel,
    riders: [
      {
        id: "player",
        name,
        avatar,
        ai: false,
        lane: 1,
        distance: 0,
        energy: 10000,
        boost: 0,
        penalty: 0,
        hits: 0,
        finishMs: null,
      },
      {
        id: "ai-violet",
        name: "Violet Volt",
        avatar: 1,
        ai: true,
        lane: 0,
        distance: 0,
        energy: 10000,
        boost: 0,
        penalty: 0,
        hits: 0,
        finishMs: null,
      },
      {
        id: "ai-cyan",
        name: "Cyan Comet",
        avatar: 2,
        ai: true,
        lane: 2,
        distance: 0,
        energy: 10000,
        boost: 0,
        penalty: 0,
        hits: 0,
        finishMs: null,
      },
    ],
  };
}
export function applyRaceAction(rider: Rider, action: RaceAction) {
  if (rider.finishMs !== null) return;
  if (action === "left") rider.lane = Math.max(0, rider.lane - 1);
  if (action === "right") rider.lane = Math.min(2, rider.lane + 1);
  if (action === "boost" && rider.energy >= 3500 && rider.boost === 0) {
    rider.energy -= 3500;
    rider.boost = 40;
  }
}
export function advanceRace(
  original: RaceState,
  targetTick: number,
): RaceState {
  const state = structuredClone(original);
  const course = raceCourse(state.seed);
  const target = Math.min(1800, Math.max(state.tick, Math.floor(targetTick)));
  while (state.tick < target && state.riders.some((r) => r.finishMs === null)) {
    state.tick++;
    for (const input of state.inputs)
      if (input.tick === state.tick)
        applyRaceAction(state.riders[0], input.action);
    for (const rider of state.riders) {
      if (rider.finishMs !== null) continue;
      if (rider.ai && state.tick % 10 === 0) {
        const hazard = course.find(
          (item) =>
            item.kind === "obstacle" &&
            item.lane === rider.lane &&
            item.at > rider.distance &&
            item.at - rider.distance < 45000,
        );
        // AI is simulated, with deterministic mistakes rather than perfect knowledge.
        if (
          hazard &&
          (hazard.id + state.seed + (rider.id === "ai-cyan" ? 2 : 0)) % 5 !== 0
        ) {
          const lanes = [0, 1, 2].filter(
            (lane) =>
              !course.some(
                (item) =>
                  item.kind === "obstacle" &&
                  item.lane === lane &&
                  item.at > rider.distance &&
                  item.at - rider.distance < 55000,
              ),
          );
          const best = lanes.sort(
            (a, b) => Math.abs(a - rider.lane) - Math.abs(b - rider.lane),
          )[0];
          if (best !== undefined) rider.lane += Math.sign(best - rider.lane);
        }
        if (rider.energy >= 6000 && rider.penalty === 0)
          applyRaceAction(rider, "boost");
      }
      const base = rider.ai ? (rider.id === "ai-cyan" ? 1990 : 1950) : 2100;
      const speed = Math.floor(
        base * (rider.boost > 0 ? 1.5 : 1) * (rider.penalty > 0 ? 0.45 : 1),
      );
      const previous = rider.distance;
      rider.distance = Math.min(RACE_LENGTH, previous + speed);
      rider.boost = Math.max(0, rider.boost - 1);
      rider.penalty = Math.max(0, rider.penalty - 1);
      rider.energy = Math.min(10000, rider.energy + state.wheel.energyPerTick);
      for (const item of course)
        if (
          item.at > previous &&
          item.at <= rider.distance &&
          item.lane === rider.lane
        ) {
          if (item.kind === "energy")
            rider.energy = Math.min(10000, rider.energy + 2000);
          else {
            rider.hits++;
            rider.penalty = 30;
            rider.boost = 0;
          }
        }
      if (rider.distance === RACE_LENGTH)
        rider.finishMs =
          (state.tick - 1) * TICK_MS +
          Math.ceil(((RACE_LENGTH - previous) * TICK_MS) / speed);
    }
  }
  return state;
}
export function raceStandings(state: RaceState) {
  return [...state.riders]
    .sort((a, b) => {
      if (a.finishMs !== null && b.finishMs !== null)
        return a.finishMs - b.finishMs || a.id.localeCompare(b.id);
      if (a.finishMs !== null) return -1;
      if (b.finishMs !== null) return 1;
      return b.distance - a.distance || a.id.localeCompare(b.id);
    })
    .map((r, index) => ({ ...r, rank: index + 1 }));
}
export function queueRaceAction(
  state: RaceState,
  action: RaceAction,
  sequence: number,
): RaceState {
  if (sequence === state.sequence && state.inputs.at(-1)?.action === action)
    return state;
  if (sequence !== state.sequence + 1)
    throw new Error("Race action sequence mismatch; refresh the match");
  const previous = state.inputs.at(-1);
  if (previous && state.tick + 1 - previous.tick < 3)
    throw new Error("Race controls are too fast; wait briefly");
  if (state.riders[0].finishMs !== null)
    throw new Error("Race already finished for this racer");
  if (state.inputs.length >= 600) throw new Error("Race input limit reached");
  return {
    ...state,
    sequence,
    inputs: [...state.inputs, { tick: state.tick + 1, sequence, action }],
  };
}
