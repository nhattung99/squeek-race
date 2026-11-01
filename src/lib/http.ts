import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { playerFor, rateLimit } from "./game";
export async function currentPlayer() {
  return playerFor((await cookies()).get("arena_session")?.value);
}
export function checkOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected =
    process.env.APP_ORIGIN ??
    (process.env.NODE_ENV !== "production"
      ? `http://${request.headers.get("host")}`
      : null);
  if (!expected || origin !== expected)
    throw new Error("Invalid request origin");
}
export async function readBody(request: NextRequest) {
  if (Number(request.headers.get("content-length") ?? 0) > 2048)
    throw new Error("Request too large");
  const body = await request.text();
  if (body.length > 2048) throw new Error("Request too large");
  return JSON.parse(body) as unknown;
}
export async function requirePlayer() {
  const player = await currentPlayer();
  if (!player) throw new Error("Create a racer profile first");
  return player;
}
export async function limitRequest(
  request: NextRequest,
  scope: string,
  max: number,
) {
  const ip =
    process.env.TRUST_PROXY === "true"
      ? (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown")
      : "local";
  await rateLimit(`${scope}:${ip}`, max);
}
export function failure(e: unknown) {
  const message = e instanceof Error ? e.message : "Request failed";
  const publicPrefixes = [
    "Invalid request origin",
    "Request too large",
    "Create a racer",
    "A profile already",
    "Prediction ",
    "Round unavailable",
    "Hardware ",
    "Too many requests",
    "Daily challenge",
    "At least ",
    "Not enough ",
    "Squeekchain ",
    "Source ",
    "Installation changed",
    "Feed advanced",
    "Incomplete hardware",
    "Unverified hardware",
    "Invalid round",
  ];
  const safe = publicPrefixes.some((prefix) => message.startsWith(prefix))
    ? message
    : "Request could not be completed. Check your input or retry later.";
  return NextResponse.json(
    { error: safe },
    { status: message.startsWith("Too many requests") ? 429 : 400 },
  );
}
