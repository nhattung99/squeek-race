import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  blocksSchema,
  coreSchema,
  eventsSchema,
  publishedIdentityMatches,
  settlementsSchema,
  statsSchema,
} from "../src/lib/diagnostics";
describe("all investigated endpoint snapshots", () => {
  for (const [name, schema] of Object.entries({
    core: coreSchema,
    blocks: blocksSchema,
    events: eventsSchema,
    settlements: settlementsSchema,
    stats: statsSchema,
  }))
    it(`parses actual ${name} fields`, () => {
      const fixture = JSON.parse(
        readFileSync(`docs/sources/${name}.json`, "utf8"),
      );
      expect(schema.safeParse(fixture).success).toBe(true);
    });
  it("detects the real API / published deployment mismatch", () => {
    const fixture = JSON.parse(readFileSync("docs/sources/core.json", "utf8"));
    expect(publishedIdentityMatches(coreSchema.parse(fixture))).toBe(false);
  });
});
