import { describe, expect, it } from "vitest";
import { arcadeStep, initialArcade, course } from "../src/lib/arcade";
describe("isolated arcade practice", () => {
  it("stays still until started", () =>
    expect(arcadeStep(initialArcade(), 0.1).distance).toBe(0));
  it("moves automatically and boost increases speed", () => {
    const s = { ...initialArcade(), status: "racing" as const };
    expect(arcadeStep(s, 0.1).distance).toBeGreaterThan(0);
    expect(arcadeStep({ ...s, boost: 1 }, 0.1).distance).toBeGreaterThan(
      arcadeStep(s, 0.1).distance,
    );
  });
  it("collisions only affect the matching lane", () => {
    const obstacle = course.find((i) => i.kind === "obstacle")!;
    const s = {
      ...initialArcade(),
      status: "racing" as const,
      distance: obstacle.at - 1,
      lane: obstacle.lane,
    };
    expect(arcadeStep(s, 0.1).hearts).toBe(2);
    expect(arcadeStep({ ...s, lane: (s.lane + 1) % 3 }, 0.1).hearts).toBe(3);
  });
  it("finishes or loses without awards or server scores", () => {
    expect(
      arcadeStep({ ...initialArcade(), status: "racing", distance: 599 }, 0.1)
        .status,
    ).toBe("won");
    const obstacle = course.find((i) => i.kind === "obstacle")!;
    expect(
      arcadeStep(
        {
          ...initialArcade(),
          status: "racing",
          hearts: 1,
          distance: obstacle.at - 1,
          lane: obstacle.lane,
        },
        0.1,
      ).status,
    ).toBe("lost");
  });
});
