// Operator service. Never run with a player's wallet key. Not deployed by this script.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { matchKey, winTypedData } from "../src/lib/win-protocol";
if (existsSync(".env.signer.local")) process.loadEnvFile(".env.signer.local");
const key = process.env.WIN_ATTESTOR_PRIVATE_KEY;
const token = process.env.WIN_SIGNER_TOKEN;
const registry = process.env.WIN_REGISTRY_ADDRESS;
if (
  !key ||
  !/^0x[0-9a-fA-F]{64}$/.test(key) ||
  !token ||
  token.length < 32 ||
  !registry ||
  !process.env.DATABASE_URL
)
  throw new Error(
    "Configure the isolated signer environment. No credentials should be supplied in chat.",
  );
const account = privateKeyToAccount(key as `0x${string}`);
const registryAddress = getAddress(registry);
if (
  account.address.toLowerCase() !==
  process.env.WIN_ATTESTOR_ADDRESS?.toLowerCase()
)
  throw new Error("Signer public address mismatch");
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const input = z
  .object({
    id: z.string().uuid(),
    registry: z.string(),
    voucher: z
      .object({
        matchId: hex32,
        player: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        resultDigest: hex32,
        expiresAt: z.string().regex(/^\d{1,12}$/),
      })
      .strict(),
  })
  .strict();
const database = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  connection: { default_transaction_read_only: true },
});
try {
  await database`SELECT 1`;
} catch {
  throw new Error(
    "Signer database is unavailable. Check its private operator configuration.",
  );
}
createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const authorization = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (
    req.method !== "POST" ||
    req.url !== "/attest" ||
    authorization.length !== expected.length ||
    !timingSafeEqual(authorization, expected)
  ) {
    res.writeHead(403).end();
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 2048) throw new Error("body");
      chunks.push(Buffer.from(chunk));
    }
    const data = input.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    const expires = BigInt(data.voucher.expiresAt);
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (
      getAddress(data.registry) !== registryAddress ||
      matchKey(data.id) !== data.voucher.matchId ||
      expires < now ||
      expires > now + 600n
    )
      throw new Error("domain");
    // Independently check persisted first place, wallet proof and immutable receipt.
    const [record] = await database<
      { digest: string }[]
    >`SELECT r.digest FROM race_results r JOIN win_claims w ON w.match_id=r.match_id AND w.player_id=r.player_id WHERE r.match_id=${data.id} AND r.rank=1 AND w.verified=true AND lower(w.wallet)=${data.voucher.player.toLowerCase()}`;
    if (!record || `0x${record.digest}` !== data.voucher.resultDigest)
      throw new Error("win");
    const signature = await account.signTypedData(
      winTypedData(registryAddress, {
        ...data.voucher,
        matchId: data.voucher.matchId as `0x${string}`,
        player: getAddress(data.voucher.player),
        resultDigest: data.voucher.resultDigest as `0x${string}`,
      }),
    );
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ signature }));
  } catch {
    res.writeHead(400).end(JSON.stringify({ error: "Attestation rejected" }));
  }
}).listen(Number(process.env.WIN_SIGNER_PORT ?? 8787), "127.0.0.1", () =>
  console.log(
    "Victory signer listening on loopback. Use an authenticated HTTPS service boundary for production.",
  ),
);
