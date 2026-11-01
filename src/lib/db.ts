import { PGlite } from "@electric-sql/pglite";
import { drizzle as localDrizzle } from "drizzle-orm/pglite";
import { drizzle as remoteDrizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, type SQL } from "drizzle-orm";
import { mkdir } from "node:fs/promises";

export interface Executor {
  execute(query: SQL): Promise<unknown>;
}
export interface Database extends Executor {
  transaction<T>(cb: (tx: Executor) => Promise<T>): Promise<T>;
}
declare global {
  var arenaDatabase: Promise<Database> | undefined;
}
export async function rows<T>(db: Executor, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (
    Array.isArray(result) ? result : (result as { rows: T[] }).rows
  ) as T[];
}
const ddl = [
  `CREATE TABLE IF NOT EXISTS arena_guard(id integer PRIMARY KEY)`,
  `INSERT INTO arena_guard VALUES(1) ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS players(id text PRIMARY KEY, token_hash text UNIQUE NOT NULL, nickname text NOT NULL, avatar integer NOT NULL, created_at bigint NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS limits(key text PRIMARY KEY, hits integer NOT NULL, expires bigint NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS feed(id integer PRIMARY KEY, installation text, cursor text, coverage_start bigint, coverage_end bigint, updated_at bigint, caught_up boolean NOT NULL DEFAULT false)`,
  `ALTER TABLE feed ADD COLUMN IF NOT EXISTS halted text`,
  `INSERT INTO feed(id) VALUES(1) ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS segments(id text PRIMARY KEY, payload jsonb NOT NULL, digest text NOT NULL, start_at bigint NOT NULL, end_at bigint NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rounds(id text PRIMARY KEY, starts_at bigint NOT NULL, ends_at bigint NOT NULL, locks_at bigint NOT NULL, thresholds jsonb NOT NULL, installation text NOT NULL, status text NOT NULL DEFAULT 'open', work text, outcome text, evidence jsonb, settled_at bigint)`,
  `CREATE TABLE IF NOT EXISTS predictions(id text PRIMARY KEY, player_id text NOT NULL REFERENCES players(id), round_id text NOT NULL REFERENCES rounds(id), choice text NOT NULL CHECK(choice IN ('cozy','cruise','zoom')), created_at bigint NOT NULL, UNIQUE(player_id,round_id))`,
  `CREATE TABLE IF NOT EXISTS awards(id text PRIMARY KEY, player_id text NOT NULL REFERENCES players(id), round_id text REFERENCES rounds(id), points integer NOT NULL, correct boolean, created_at bigint NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS daily(player_id text NOT NULL REFERENCES players(id), day text NOT NULL, challenge jsonb NOT NULL, answer text, PRIMARY KEY(player_id,day))`,
  `CREATE TABLE IF NOT EXISTS audit(id text PRIMARY KEY, kind text NOT NULL, detail jsonb NOT NULL, created_at bigint NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS segments_time ON segments(start_at,end_at)`,
  `CREATE INDEX IF NOT EXISTS predictions_player ON predictions(player_id)`,
];
export function getDb(): Promise<Database> {
  return (globalThis.arenaDatabase ??= (async () => {
    let db: Database;
    if (process.env.DATABASE_URL) {
      const remote = remoteDrizzle(
        postgres(process.env.DATABASE_URL, { max: 3, prepare: false }),
      );
      db = {
        execute: async (q) => remote.execute(q),
        transaction: (cb) => remote.transaction((tx) => cb(tx)),
      };
    } else {
      if (process.env.VERCEL)
        throw new Error("DATABASE_URL is required on Vercel");
      const directory = process.env.ARENA_DATA_DIR ?? ".data/postgres";
      await mkdir(directory, { recursive: true });
      const local = localDrizzle(new PGlite(directory));
      db = {
        execute: async (q) => local.execute(q),
        transaction: (cb) => local.transaction((tx) => cb(tx)),
      };
    }
    for (const statement of ddl) await db.execute(sql.raw(statement));
    return db;
  })());
}
export async function locked<T>(cb: (tx: Executor) => Promise<T>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM arena_guard WHERE id=1 FOR UPDATE`);
    return cb(tx);
  });
}
