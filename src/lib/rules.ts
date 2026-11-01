import type { Segment } from "./squeekchain";
export const WINDOW_MS = 120_000;
export type Choice = "cozy" | "cruise" | "zoom";
export type Thresholds = { low: string; high: string; samples: number };
export function calibrate(values: string[]): Thresholds {
  if (values.length < 12)
    throw new Error("At least 12 complete historical windows are required");
  const active = values
    .map(BigInt)
    .filter((v) => v > 0n)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (active.length < 3)
    throw new Error("Not enough active hardware history to calibrate");
  return {
    low: "0",
    high: active[Math.floor((active.length - 1) / 2)].toString(),
    samples: values.length,
  };
}
export function classify(work: string, thresholds: Thresholds): Choice {
  const value = BigInt(work);
  return value <= BigInt(thresholds.low)
    ? "cozy"
    : value <= BigInt(thresholds.high)
      ? "cruise"
      : "zoom";
}
export function score(correct: boolean, streak: number) {
  const nextStreak = correct ? streak + 1 : 0;
  return {
    points: correct ? 100 + (nextStreak % 3 === 0 ? 50 : 0) : 0,
    streak: nextStreak,
  };
}
export function nextWindow(now: number) {
  const start = Math.ceil((now + 30_000) / WINDOW_MS) * WINDOW_MS;
  return { start, end: start + WINDOW_MS, lock: start };
}
export function assertPrediction(now: number, lock: number, existing: boolean) {
  if (existing) throw new Error("Prediction already locked");
  if (now >= lock) throw new Error("Prediction window closed");
}
export function measureWindow(
  segments: Segment[],
  start: number,
  end: number,
  coverageStart: number,
  coverageEnd: number,
) {
  if (coverageStart > start || coverageEnd < end)
    throw new Error("Incomplete hardware coverage");
  const relevant = segments.filter(
    (s) => Date.parse(s.endAt) >= start && Date.parse(s.startAt) < end,
  );
  const ids: string[] = [];
  const seen = new Set<string>();
  let work = 0n;
  for (const s of relevant) {
    if (
      s.provenance !== "hardware" ||
      !s.measurementEligible ||
      (s.discontinuity && Date.parse(s.startAt) >= start)
    )
      throw new Error("Unverified hardware interval");
    ids.push(s.segmentId);
    for (const passage of s.passages) {
      const at = Date.parse(passage.at);
      if (at >= start && at < end) {
        if (seen.has(passage.at))
          throw new Error("Overlapping passage evidence");
        seen.add(passage.at);
        work++;
      }
    }
  }
  return { work: work.toString(), segmentIds: ids };
}
export function leaderboardOrder(
  a: { points: number; correct: number; total: number; id: string },
  b: { points: number; correct: number; total: number; id: string },
) {
  return (
    b.points - a.points ||
    b.correct * Math.max(1, a.total) - a.correct * Math.max(1, b.total) ||
    b.total - a.total ||
    a.id.localeCompare(b.id)
  );
}
