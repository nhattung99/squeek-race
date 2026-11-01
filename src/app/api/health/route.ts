import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.VERCEL && !process.env.DATABASE_URL)
    return NextResponse.json(
      {
        status: "misconfigured",
        code: "DATABASE_URL_MISSING",
        message:
          "Connect PostgreSQL and set DATABASE_URL for the Production environment, then redeploy.",
      },
      { status: 503, headers },
    );
  try {
    await (await getDb()).execute(sql`SELECT 1`);
    return NextResponse.json(
      { status: "ok", database: "connected" },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        code: "DATABASE_UNAVAILABLE",
        message:
          "Check the PostgreSQL connection, credentials and database permissions in Vercel. Do not share connection strings publicly.",
      },
      { status: 503, headers },
    );
  }
}
