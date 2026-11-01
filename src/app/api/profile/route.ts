import { NextRequest, NextResponse } from "next/server";
import { createPlayer, playerInput } from "@/lib/game";
import {
  checkOrigin,
  currentPlayer,
  failure,
  limitRequest,
  readBody,
} from "@/lib/http";
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    await limitRequest(request, "profile", 5);
    if (await currentPlayer())
      throw new Error("A profile already exists in this session");
    const input = playerInput.parse(await readBody(request));
    const { token, player } = await createPlayer(input.nickname, input.avatar);
    const response = NextResponse.json({ player });
    response.cookies.set("arena_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 90 * 86400,
      path: "/",
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
