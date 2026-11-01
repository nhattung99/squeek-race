import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb, rows } from "../src/lib/db";
import { syncFeed } from "../src/lib/game";
// Trusted operator process only. Credentials never enter the browser.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) {
  console.error(
    "Set the shared production DATABASE_URL in an ignored .env.local file or in the trusted worker environment. Do not paste credentials in chat.",
  );
  process.exit(1);
}
const watch = process.argv.includes("--watch");
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
do {
  try {
    await syncFeed();
    const feed = (
      await rows<{
        caught_up: boolean;
        coverage_end: string | null;
        halted: string | null;
      }>(
        await getDb(),
        sql`SELECT caught_up,coverage_end,halted FROM feed WHERE id=1`,
      )
    )[0];
    console.log(
      JSON.stringify({
        syncedAt: new Date().toISOString(),
        caughtUp: feed.caught_up,
        coverageThrough: feed.coverage_end
          ? new Date(Number(feed.coverage_end)).toISOString()
          : null,
        halted: !!feed.halted,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error(
      message.startsWith("Squeekchain ") || message.startsWith("Source ")
        ? message
        : "Trusted sync failed. Check source access and database configuration in your worker environment.",
    );
    if (!watch) process.exit(1);
  }
  if (watch && !stopping)
    await new Promise((resolve) => setTimeout(resolve, 15000));
} while (watch && !stopping);
process.exit(0);
