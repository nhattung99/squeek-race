import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiGet } from "../src/lib/squeekchain";
afterEach(() => vi.unstubAllGlobals());
describe("source failures fail closed", () => {
  it("rejects HTTP 200 unavailable data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              status: "unavailable",
              reason: "indexer_unavailable",
            }),
          ),
        ),
    );
    await expect(
      apiGet("/test-unavailable", z.object({ value: z.number() })),
    ).rejects.toThrow("unavailable");
  });
  it("rejects schema drift", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ value: "wrong" }))),
    );
    await expect(
      apiGet("/test-schema", z.object({ value: z.number() })),
    ).rejects.toThrow();
  });
  it("uses conditional response bodies without parsing an empty 304", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: 4 }), {
          headers: { ETag: '"v1"' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", mock);
    const schema = z.object({ value: z.number() });
    expect(await apiGet("/test-etag", schema, 0)).toEqual({ value: 4 });
    expect(await apiGet("/test-etag", schema, 0)).toEqual({ value: 4 });
    expect(mock.mock.calls[1][1].headers["If-None-Match"]).toBe('"v1"');
  });
  it("respects rate-limit backoff instead of retrying aggressively", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 429, headers: { "Retry-After": "1" } }),
      );
    vi.stubGlobal("fetch", mock);
    await expect(apiGet("/test-rate", z.unknown())).rejects.toThrow("busy");
    await expect(apiGet("/test-rate-again", z.unknown())).rejects.toThrow(
      "rate limited",
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
