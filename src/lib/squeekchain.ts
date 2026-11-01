import { z } from "zod";

export const uint = z.string().regex(/^\d+$/);
const timestamp = z
  .string()
  .refine((v) => Number.isFinite(Date.parse(v)), "Invalid timestamp");
export const statusSchema = z.object({
  schemaVersion: z.literal(1),
  installationId: z.string(),
  generatedAt: timestamp,
  measurement: z
    .object({
      freshness: z.enum(["online", "stale"]),
      observedAt: timestamp,
      receivedAt: timestamp,
      staleAfterSeconds: z.number().int().positive(),
      counterEpoch: z.string(),
      cumulativeWorkUnits: uint,
      provenance: z.enum(["hardware", "simulated", "replay", "derived"]),
      coreStatus: z.enum(["IDLE", "ACTIVE", "COUNTER_FAULT"]),
      rpmMilli: z.number().int().nonnegative(),
      speedMmPerSecond: z.number().int().nonnegative(),
      distanceMm: z.number().int().nonnegative(),
    })
    .nullable(),
});
export const segmentSchema = z
  .object({
    segmentId: z.string(),
    continuityId: z.string(),
    discontinuity: z.boolean(),
    startAt: timestamp,
    endAt: timestamp,
    workUnits: uint,
    provenance: z.string(),
    profile: z.string(),
    measurementEligible: z.boolean(),
    observedAt: timestamp,
    receivedAt: timestamp,
    passages: z.array(z.object({ at: timestamp, offsetNs: uint })),
  })
  .refine(
    (v) => BigInt(v.workUnits) === BigInt(v.passages.length),
    "Incomplete passage evidence",
  );
export const runsSchema = z.object({
  schemaVersion: z.literal("measurement-runs.v1"),
  installationId: z.string(),
  generatedAt: timestamp,
  authority: z.literal("pi-device-key"),
  certifiedCoreWork: z.literal(false),
  freshness: z.enum(["fresh", "stale", "unavailable"]),
  coverageStartAt: timestamp.nullable(),
  coverageThroughAt: timestamp.nullable(),
  items: z.array(segmentSchema),
  nextCursor: z.string().nullable(),
});
export type Segment = z.infer<typeof segmentSchema>;
export type WheelStatus = z.infer<typeof statusSchema>;
export const API_BASE = "https://api.squeekchain.com/v1";
type CacheEntry = { data: unknown; etag: string | null; until: number };
const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<unknown>>();
let blockedUntil = 0;
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  ttl = 5000,
): Promise<T> {
  const prior = cache.get(path);
  if (prior && prior.until > Date.now()) return schema.parse(prior.data);
  if (blockedUntil > Date.now())
    throw new Error(
      "Squeekchain is rate limited. Please wait before retrying.",
    );
  const existing = pending.get(path);
  if (existing) return schema.parse(await existing);
  const task = (async () => {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: "application/json",
        ...(prior?.etag ? { "If-None-Match": prior.etag } : {}),
      },
    });
    if (response.status === 304 && prior) {
      prior.until = Date.now() + ttl;
      return prior.data;
    }
    if (response.status === 429 || response.status === 503) {
      blockedUntil =
        Date.now() +
        Math.min(
          300,
          Math.max(1, Number(response.headers.get("retry-after")) || 5),
        ) *
          1000;
      throw new Error("Source busy; retry later.");
    }
    if (!response.ok) throw new Error(`Squeekchain HTTP ${response.status}`);
    const raw: unknown = await response.json();
    if (
      raw &&
      typeof raw === "object" &&
      "status" in raw &&
      raw.status === "unavailable"
    )
      throw new Error("Squeekchain data unavailable");
    const data = schema.parse(raw);
    cache.set(path, {
      data,
      etag: response.headers.get("etag"),
      until: Date.now() + ttl,
    });
    return data;
  })();
  pending.set(path, task);
  try {
    return schema.parse(await task);
  } finally {
    pending.delete(path);
  }
}
export async function getWheel() {
  const data = await apiGet("/status", statusSchema, 5000);
  const m = data.measurement;
  return {
    ...data,
    fresh:
      !!m &&
      m.freshness === "online" &&
      m.provenance === "hardware" &&
      m.coreStatus !== "COUNTER_FAULT" &&
      Date.now() - Date.parse(m.receivedAt) <= m.staleAfterSeconds * 1000 &&
      Date.now() - Date.parse(m.observedAt) <= m.staleAfterSeconds * 1000 &&
      Date.parse(m.receivedAt) <= Date.now() + 5000,
  };
}
