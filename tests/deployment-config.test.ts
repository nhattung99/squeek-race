import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("Vercel output discovery", () => {
  for (const phase of ["production", "development", "test"] as const)
    it(`uses the same Vercel output during ${phase}`, async () => {
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("NODE_ENV", phase);
      vi.resetModules();
      expect((await import("../next.config")).default.distDir).toBe(".next");
    });
  it("keeps local production builds separate", async () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    expect((await import("../next.config")).default.distDir).toBe(
      ".next-production",
    );
  });
  it("keeps local development at the normal path", async () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    expect((await import("../next.config")).default.distDir).toBe(".next");
  });
});
