import { z } from "zod";
import { apiGet, uint } from "./squeekchain";
// Verified documentation fields. These reads are diagnostic only, never scoring authority.
const chain = z.object({ chainId: uint, safeThroughBlock: uint });
export const coreSchema = z.object({
  schemaVersion: z.literal(1),
  installationId: z.string(),
  status: z.literal("available"),
  chain,
  identities: z.object({ core: z.string(), proxyImplementation: z.string() }),
  configuration: z.object({ genesisTimestamp: uint, roundDuration: uint }),
  core: z.object({
    cumulativeWork: uint,
    cumulativeBlockUnits: uint,
    settledThroughRound: uint,
    paused: z.boolean(),
  }),
  implementation: z.object({
    codeVersion: uint,
    runtimeHash: z.string(),
    storageLayoutDigest: z.string(),
  }),
});
export const blocksSchema = z.object({
  schemaVersion: z.literal("game-block-projection.v1"),
  installationId: z.string(),
  status: z.literal("available"),
  freshness: z.string(),
  chain: z.object({
    chainId: uint,
    coreAddress: z.string(),
    graphManifestDigest: z.string(),
  }),
  blocks: z.array(
    z.object({
      height: uint,
      workThreshold: uint,
      roundId: uint,
      completingAt: z.string().nullable(),
    }),
  ),
});
export const statsSchema = z.object({
  schemaVersion: z.literal(1),
  installationId: z.string(),
  generatedAt: z.string(),
  range: z.enum(["7d", "30d"]),
  activity: z.object({
    provenance: z.literal("accepted_rounds"),
    days: z.array(
      z.object({
        date: z.string(),
        buckets: z.array(
          z.object({
            startMinuteUtc: z.number().int(),
            coverage: z.enum(["complete", "partial", "missing", "future"]),
            workUnits: uint.nullable(),
          }),
        ),
      }),
    ),
  }),
});
export const settlementsSchema = z.object({
  schemaVersion: z.literal(3),
  installationId: z.string(),
  status: z.literal("available"),
  chain,
  recentSettlements: z.array(
    z.object({
      transactionHash: z.string(),
      previousSettledThroughRound: uint,
      settledThroughRound: uint,
      workAdded: uint,
      ethereumBlockNumber: uint,
      blockTimestamp: z.string(),
      confirmationStatus: z.literal("safe"),
    }),
  ),
});
export const eventsSchema = z.object({
  schemaVersion: z.literal(3),
  installationId: z.string(),
  status: z.literal("available"),
  chain,
  nextCursor: z.string().nullable(),
  events: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      occurredAt: z.string(),
      source: z
        .object({ kind: z.enum(["chain", "measurement"]) })
        .passthrough(),
      payload: z.record(z.string(), z.unknown()),
    }),
  ),
});
export const diagnostics = {
  core: () => apiGet("/core", coreSchema, 5000),
  blocks: () => apiGet("/measurement/blocks", blocksSchema, 0),
  stats: (range: "7d" | "30d" = "7d") =>
    apiGet(`/measurement/stats?range=${range}`, statsSchema, 60000),
  settlements: () => apiGet("/settlements?range=7d", settlementsSchema, 60000),
  events: (cursor?: string) =>
    apiGet(
      `/events?category=all&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      eventsSchema,
      5000,
    ),
};
export const PUBLISHED_CORE = "0x74665daeca35a2303e767e76a2ff1fb6f93e119f";
export function publishedIdentityMatches(core: z.infer<typeof coreSchema>) {
  return (
    core.chain.chainId === "11155111" &&
    core.identities.core.toLowerCase() === PUBLISHED_CORE
  );
}
