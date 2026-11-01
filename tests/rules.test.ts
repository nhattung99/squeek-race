import { describe, expect, it } from "vitest";
import {
  assertPrediction,
  calibrate,
  classify,
  leaderboardOrder,
  measureWindow,
  nextWindow,
  score,
} from "../src/lib/rules";
import { integer, milli } from "../src/lib/utils";
import {
  runsSchema,
  segmentSchema,
  statusSchema,
  type Segment,
} from "../src/lib/squeekchain";
import { readFileSync } from "node:fs";
const start = Date.parse("2026-10-30T00:00:00Z");
const segment: Segment = {
  segmentId: "s",
  continuityId: "epoch",
  discontinuity: false,
  startAt: new Date(start).toISOString(),
  endAt: new Date(start + 1000).toISOString(),
  workUnits: "2",
  provenance: "hardware",
  profile: "staging",
  measurementEligible: true,
  observedAt: new Date(start + 1000).toISOString(),
  receivedAt: new Date(start + 1100).toISOString(),
  passages: [
    { at: new Date(start).toISOString(), offsetNs: "0" },
    { at: new Date(start + 1000).toISOString(), offsetNs: "1000000000" },
  ],
};
describe("deterministic game rules", () => {
  it("awards correct predictions and every third consecutive win", () => {
    expect(score(true, 0)).toEqual({ points: 100, streak: 1 });
    expect(score(true, 2)).toEqual({ points: 150, streak: 3 });
    expect(score(true, 5)).toEqual({ points: 150, streak: 6 });
  });
  it("awards no points and resets streak on a wrong prediction", () =>
    expect(score(false, 5)).toEqual({ points: 0, streak: 0 }));
  it("rejects exact lock boundary, late entries, and duplicates", () => {
    expect(() => assertPrediction(100, 100, false)).toThrow("closed");
    expect(() => assertPrediction(101, 100, false)).toThrow("closed");
    expect(() => assertPrediction(1, 100, true)).toThrow("already");
    expect(() => assertPrediction(99, 100, false)).not.toThrow();
  });
  it("starts future UTC intervals with at least 30 seconds lead", () => {
    for (const now of [0, 90_000, 90_001, 120_000]) {
      const window = nextWindow(now);
      expect(window.start - now).toBeGreaterThanOrEqual(30000);
      expect(window.start % 120000).toBe(0);
      expect(window.end - window.start).toBe(120000);
    }
  });
  it("calibrates positive median and keeps zero a separate outcome", () => {
    const t = calibrate([
      "0",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
    expect(t.high).toBe("5");
    expect(classify("0", t)).toBe("cozy");
    expect(classify("5", t)).toBe("cruise");
    expect(classify("6", t)).toBe("zoom");
    expect(() => calibrate(["0"])).toThrow();
  });
  it("counts exact passage timestamps in a half-open interval", () => {
    expect(
      measureWindow([segment], start, start + 1000, start, start + 120000).work,
    ).toBe("1");
  });
  it("rejects incomplete, non-hardware, discontinuous, and overlapping evidence", () => {
    expect(() =>
      measureWindow([segment], start, start + 2000, start, start + 1000),
    ).toThrow("coverage");
    for (const patch of [
      { provenance: "replay" },
      { measurementEligible: false },
      { discontinuity: true },
    ])
      expect(() =>
        measureWindow(
          [{ ...segment, ...patch }],
          start,
          start + 2000,
          start,
          start + 3000,
        ),
      ).toThrow("Unverified");
    expect(() =>
      measureWindow(
        [segment, segment],
        start,
        start + 2000,
        start,
        start + 3000,
      ),
    ).toThrow("Overlapping");
  });
  it("preserves integer precision", () => {
    expect(integer("9007199254740993123456")).toBe(
      "9,007,199,254,740,993,123,456",
    );
    expect(milli(12500)).toBe("12.5");
  });
  it("sorts points, accuracy, participation and stable identity", () => {
    const list = [
      { id: "b", points: 100, correct: 1, total: 2 },
      { id: "a", points: 100, correct: 2, total: 2 },
      { id: "c", points: 200, correct: 0, total: 1 },
    ];
    expect(list.sort(leaderboardOrder).map((x) => x.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});
describe("actual official API snapshots (2026-10-31)", () => {
  it("parses real hardware history and exact integer fields", () => {
    const fixture = JSON.parse(readFileSync("docs/sources/runs.json", "utf8"));
    expect(runsSchema.parse(fixture).items[0].workUnits).toBe("15");
  });
  it("parses actual telemetry and rejects unknown schema versions", () => {
    const fixture = JSON.parse(
      readFileSync("docs/sources/status.json", "utf8"),
    );
    expect(statusSchema.parse(fixture).measurement?.provenance).toBe(
      "hardware",
    );
    expect(() =>
      statusSchema.parse({ ...fixture, schemaVersion: 999 }),
    ).toThrow();
  });
  it("rejects missing passages rather than silently accepting totals", () =>
    expect(() =>
      segmentSchema.parse({ ...segment, workUnits: "999" }),
    ).toThrow());
});
