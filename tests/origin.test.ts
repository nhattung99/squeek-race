import { describe, expect, it } from "vitest";
import { assertRequestOrigin, allowedOrigins } from "../src/lib/origin";
const env = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_URL: "squeek-race-build.vercel.app",
  VERCEL_BRANCH_URL: "squeek-race-git-main.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "squeek-race.vercel.app",
};
describe("strict same-project origins", () => {
  it("accepts the canonical Vercel domain when APP_ORIGIN is missing", () =>
    expect(() =>
      assertRequestOrigin("https://squeek-race.vercel.app", "internal", env),
    ).not.toThrow());
  it("accepts the deployment and branch domains from trusted server environment", () => {
    for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL])
      expect(() =>
        assertRequestOrigin(`https://${host}`, "internal", env),
      ).not.toThrow();
  });
  it("normalizes whitespace and a trailing slash in explicit configuration", () =>
    expect(() =>
      assertRequestOrigin("https://game.example", "internal", {
        NODE_ENV: "production",
        APP_ORIGIN: " https://game.example/ ",
      }),
    ).not.toThrow());
  it("supports configured custom domains", () =>
    expect(
      allowedOrigins(
        { ...env, APP_ORIGIN: "https://game.example" },
        "internal",
      ).has("https://game.example"),
    ).toBe(true));
  it("never accepts arbitrary Vercel tenants or spoofed Host headers", () => {
    for (const origin of [
      "https://evil.vercel.app",
      "https://squeek-race.vercel.app.evil.example",
      "https://evil.example",
    ])
      expect(() => assertRequestOrigin(origin, "evil.example", env)).toThrow(
        "Invalid request origin",
      );
  });
  it("rejects missing, null, malformed and different-scheme Origin headers", () => {
    for (const origin of [
      null,
      "null",
      "https://squeek-race.vercel.app/",
      "http://squeek-race.vercel.app",
      "https://squeek-race.vercel.app/path",
    ])
      expect(() => assertRequestOrigin(origin, null, env)).toThrow();
  });
  it("fails closed in production without configured or platform origins", () =>
    expect(() =>
      assertRequestOrigin("https://evil.example", "evil.example", {
        NODE_ENV: "production",
      }),
    ).toThrow());
  it("allows only loopback host origins for local development", () => {
    expect(() =>
      assertRequestOrigin("http://127.0.0.1:3000", "127.0.0.1:3000", {
        NODE_ENV: "development",
      }),
    ).not.toThrow();
    expect(() =>
      assertRequestOrigin("http://evil.example", "evil.example", {
        NODE_ENV: "development",
      }),
    ).toThrow();
  });
  it("rejects credentials or paths in configured origins", () => {
    expect(
      allowedOrigins(
        {
          NODE_ENV: "production",
          APP_ORIGIN: "https://user:password@game.example",
        },
        null,
      ).size,
    ).toBe(0);
    expect(
      allowedOrigins(
        { NODE_ENV: "production", APP_ORIGIN: "https://game.example/path" },
        null,
      ).size,
    ).toBe(0);
  });
});
