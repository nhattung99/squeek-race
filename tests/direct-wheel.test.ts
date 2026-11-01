import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fetchDirectWheel } from "../src/lib/direct-wheel";
import { wheelWithFreshness, statusSchema } from "../src/lib/squeekchain";
afterEach(() => vi.unstubAllGlobals());
const snapshot = () =>
  JSON.parse(readFileSync("docs/sources/status.json", "utf8"));
describe("public browser telemetry has display-only authority", () => {
  it("reads only the fixed official endpoint without cookies", async () => {
    const raw = snapshot();
    raw.measurement.observedAt = new Date().toISOString();
    raw.measurement.receivedAt = new Date().toISOString();
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(raw)));
    vi.stubGlobal("fetch", mock);
    const result = await fetchDirectWheel(new AbortController().signal);
    expect(result.fresh).toBe(true);
    expect(mock.mock.calls[0][0]).toBe("https://api.squeekchain.com/v1/status");
    expect(mock.mock.calls[0][1].credentials).toBe("omit");
    expect(mock.mock.calls[0][1].method).toBeUndefined();
  });
  it("never turns a forbidden or invalid response into live measurements", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })),
    );
    await expect(
      fetchDirectWheel(new AbortController().signal),
    ).rejects.toThrow("403");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ schemaVersion: 999 })),
        ),
    );
    await expect(
      fetchDirectWheel(new AbortController().signal),
    ).rejects.toThrow();
  });
  it("rejects stale, simulated and future readings as fresh", () => {
    const raw = snapshot();
    const now = Date.now();
    expect(wheelWithFreshness(statusSchema.parse(raw), now).fresh).toBe(false);
    for (const patch of [
      {
        provenance: "simulated",
        observedAt: new Date(now).toISOString(),
        receivedAt: new Date(now).toISOString(),
      },
      {
        observedAt: new Date(now + 60000).toISOString(),
        receivedAt: new Date(now).toISOString(),
      },
    ]) {
      const value = { ...raw, measurement: { ...raw.measurement, ...patch } };
      expect(wheelWithFreshness(statusSchema.parse(value), now).fresh).toBe(
        false,
      );
    }
  });
});
