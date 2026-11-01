export type ArcadeState = {
  distance: number;
  lane: number;
  hearts: number;
  charge: number;
  boost: number;
  elapsed: number;
  status: "ready" | "racing" | "won" | "lost";
  collected: number;
};
export const initialArcade = (): ArcadeState => ({
  distance: 0,
  lane: 1,
  hearts: 3,
  charge: 100,
  boost: 0,
  elapsed: 0,
  status: "ready",
  collected: 0,
});
export const course = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  at: 55 + i * 24,
  lane: (i * 7 + 1) % 3,
  kind: i % 3 === 0 ? "energy" : "obstacle",
}));
export function arcadeStep(state: ArcadeState, dt: number): ArcadeState {
  if (state.status !== "racing") return state;
  const delta = Math.min(0.1, Math.max(0, dt));
  const next = {
    ...state,
    elapsed: state.elapsed + delta,
    distance: Math.min(
      600,
      state.distance + delta * (state.boost > 0 ? 39 : 23),
    ),
    boost: Math.max(0, state.boost - delta),
    charge: Math.min(100, state.charge + delta * 4),
  };
  for (const item of course)
    if (
      item.at > state.distance &&
      item.at <= next.distance &&
      item.lane === state.lane
    ) {
      if (item.kind === "energy") {
        next.charge = Math.min(100, next.charge + 25);
        next.collected++;
      } else {
        next.hearts--;
        next.boost = 0;
      }
    }
  if (next.hearts <= 0) next.status = "lost";
  else if (next.distance >= 600) next.status = "won";
  return next;
}
