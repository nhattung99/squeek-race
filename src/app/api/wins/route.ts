import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, failure, readBody, requirePlayer } from "@/lib/http";
import { rateLimit } from "@/lib/game";
import {
  authorizeWin,
  confirmWin,
  createWinChallenge,
  winConfiguration,
} from "@/lib/wins";
export const runtime = "nodejs";
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const bodySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("challenge"),
      id: z.string().uuid(),
      wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal("authorize"),
      id: z.string().uuid(),
      signature: signature.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("confirm"),
      id: z.string().uuid(),
      hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    })
    .strict(),
]);
export async function GET() {
  try {
    const config = winConfiguration();
    return NextResponse.json(
      { enabled: true, registry: config.registry, chainId: 11155111 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        enabled: false,
        message:
          "On-chain win recording awaits a deployed and verified Sepolia registry. Racing remains available.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const player = await requirePlayer();
    await rateLimit(`wins:${player.id}`, 12, 60000);
    const body = bodySchema.parse(await readBody(request));
    const result =
      body.kind === "challenge"
        ? await createWinChallenge(player, body.id, body.wallet)
        : body.kind === "authorize"
          ? await authorizeWin(
              player,
              body.id,
              body.signature as `0x${string}` | undefined,
            )
          : await confirmWin(player, body.id, body.hash as `0x${string}`);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
