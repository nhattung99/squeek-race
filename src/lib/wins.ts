import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  verifyMessage,
  verifyTypedData,
  type Hex,
} from "viem";
import { winChain as sepolia } from "./win-protocol";
import { z } from "zod";
import { getDb, locked, rows } from "./db";
import { readMatch } from "./races";
import {
  matchKey,
  walletChallenge,
  winAbi,
  winTypedData,
  type WinVoucher,
} from "./win-protocol";

type Player = Parameters<typeof readMatch>[0];
type Claim = {
  match_id: string;
  player_id: string;
  wallet: string;
  message: string;
  expires: string;
  verified: boolean;
  tx_hash: Hex | null;
};
let schema: Promise<void> | undefined;
async function ensureSchema() {
  return (schema ??= (async () => {
    await (
      await getDb()
    ).execute(
      sql`CREATE TABLE IF NOT EXISTS win_claims(match_id text PRIMARY KEY, player_id text NOT NULL REFERENCES players(id), wallet text NOT NULL, message text NOT NULL, expires bigint NOT NULL, verified boolean NOT NULL DEFAULT false, tx_hash text)`,
    );
  })());
}
export function winConfiguration() {
  const {
    WIN_REGISTRY_ADDRESS: registry,
    WIN_ATTESTOR_ADDRESS: attestor,
    WIN_REGISTRY_CODE_HASH: codeHash,
    SEPOLIA_RPC_URL: rpc,
    WIN_SIGNER_URL: signerUrl,
    WIN_SIGNER_TOKEN: signerToken,
    APP_ORIGIN: origin,
  } = process.env;
  if (
    !registry ||
    !attestor ||
    !isAddress(registry) ||
    !isAddress(attestor) ||
    !codeHash ||
    !/^0x[0-9a-fA-F]{64}$/.test(codeHash) ||
    !rpc ||
    !signerUrl ||
    !signerToken ||
    !origin
  )
    throw new Error(
      "Win recording is not configured yet. The testnet registry must be deployed and verified first.",
    );
  const url = new URL(signerUrl);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
    )
  )
    throw new Error("Win signer requires HTTPS");
  return {
    registry: getAddress(registry),
    attestor: getAddress(attestor),
    codeHash: codeHash.toLowerCase(),
    rpc,
    signerUrl,
    signerToken,
    origin: new URL(origin).origin,
  };
}
export async function verifiedWinClient() {
  const config = winConfiguration();
  const client = createPublicClient({
    chain: sepolia,
    transport: http(config.rpc, { timeout: 10000, retryCount: 0 }),
  });
  const blockNumber = await client.getBlockNumber();
  if ((await client.getChainId()) !== sepolia.id)
    throw new Error("Win registry network mismatch");
  const code = await client.getCode({ address: config.registry, blockNumber });
  if (!code || keccak256(code).toLowerCase() !== config.codeHash)
    throw new Error("Win registry code mismatch");
  const attestor = await client.readContract({
    address: config.registry,
    abi: winAbi,
    functionName: "attestor",
    blockNumber,
  });
  if (attestor.toLowerCase() !== config.attestor.toLowerCase())
    throw new Error("Win registry attestor mismatch");
  return { ...config, client };
}
export async function eligibleWin(player: Player, id: string) {
  const match = await readMatch(player, id);
  if (
    !match ||
    match.status !== "finished" ||
    match.riders.find((r) => !r.ai)?.rank !== 1 ||
    !match.resultDigest
  )
    throw new Error("Win recording requires your completed first-place race");
  return match;
}
export async function createWinChallenge(
  player: Player,
  id: string,
  wallet: string,
) {
  const { origin } = winConfiguration();
  await eligibleWin(player, id);
  await ensureSchema();
  const address = getAddress(wallet);
  return locked(async (tx) => {
    const previous = (
      await rows<Claim>(tx, sql`SELECT * FROM win_claims WHERE match_id=${id}`)
    )[0];
    if (
      previous &&
      (previous.player_id !== player.id ||
        previous.wallet.toLowerCase() !== address.toLowerCase())
    )
      throw new Error("Win is already bound to another wallet");
    if (
      previous &&
      (previous.verified || Number(previous.expires) > Date.now())
    )
      return {
        message: previous.message,
        verified: previous.verified,
        txHash: previous.tx_hash,
      };
    const expires = Date.now() + 300000;
    const message = walletChallenge(origin, id, address, randomUUID(), expires);
    await tx.execute(
      sql`INSERT INTO win_claims(match_id,player_id,wallet,message,expires) VALUES(${id},${player.id},${address},${message},${expires}) ON CONFLICT(match_id) DO UPDATE SET message=${message},expires=${expires}`,
    );
    return { message, verified: false, txHash: null };
  });
}
export async function authorizeWin(
  player: Player,
  id: string,
  signature?: Hex,
) {
  const match = await eligibleWin(player, id);
  await ensureSchema();
  const claim = await locked(async (tx) => {
    const row = (
      await rows<Claim>(
        tx,
        sql`SELECT * FROM win_claims WHERE match_id=${id} AND player_id=${player.id}`,
      )
    )[0];
    if (!row) throw new Error("Win wallet challenge is missing");
    if (!row.verified) {
      if (
        Number(row.expires) < Date.now() ||
        !signature ||
        !(await verifyMessage({
          address: getAddress(row.wallet),
          message: row.message,
          signature,
        }))
      )
        throw new Error("Win wallet signature is invalid or expired");
      await tx.execute(
        sql`UPDATE win_claims SET verified=true WHERE match_id=${id}`,
      );
    }
    return row;
  });
  const config = await verifiedWinClient();
  const voucher: WinVoucher = {
    matchId: matchKey(id),
    player: getAddress(claim.wallet),
    resultDigest: `0x${match.resultDigest}`,
    expiresAt: String(Math.floor(Date.now() / 1000) + 600),
  };
  const [recordedPlayer, recordedDigest] = await config.client.readContract({
    address: config.registry,
    abi: winAbi,
    functionName: "wins",
    args: [voucher.matchId],
  });
  if (recordedPlayer !== "0x0000000000000000000000000000000000000000") {
    if (
      recordedPlayer.toLowerCase() !== claim.wallet.toLowerCase() ||
      recordedDigest !== voucher.resultDigest
    )
      throw new Error("Win on-chain record mismatch");
    return {
      recorded: true as const,
      registry: config.registry,
      txHash: claim.tx_hash,
    };
  }
  const response = await fetch(config.signerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.signerToken}`,
    },
    body: JSON.stringify({ id, registry: config.registry, voucher }),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Win attestation service unavailable");
  const signed = z
    .object({ signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) })
    .parse(await response.json()).signature as Hex;
  if (
    !(await verifyTypedData({
      address: config.attestor,
      ...winTypedData(config.registry, voucher),
      signature: signed,
    }))
  )
    throw new Error("Win attestation verification failed");
  // Simulation is from the winning wallet, before a wallet transaction can be requested.
  await config.client.simulateContract({
    address: config.registry,
    abi: winAbi,
    functionName: "recordWin",
    args: [{ ...voucher, expiresAt: BigInt(voucher.expiresAt) }, signed],
    account: voucher.player,
  });
  return {
    recorded: false as const,
    registry: config.registry,
    voucher,
    signature: signed,
  };
}
export async function confirmWin(player: Player, id: string, hash: Hex) {
  const match = await eligibleWin(player, id);
  await ensureSchema();
  const config = await verifiedWinClient();
  const receipt = await config.client.getTransactionReceipt({ hash });
  const latest = await config.client.getBlockNumber();
  const canonical = await config.client.getBlock({
    blockNumber: receipt.blockNumber,
  });
  if (
    receipt.status !== "success" ||
    receipt.to?.toLowerCase() !== config.registry.toLowerCase() ||
    latest < receipt.blockNumber + 1n ||
    canonical.hash !== receipt.blockHash
  )
    throw new Error("Win transaction requires two canonical confirmations");
  const { parseEventLogs } = await import("viem");
  const events = parseEventLogs({
    abi: winAbi,
    eventName: "WinRecorded",
    logs: receipt.logs.filter(
      (log) => log.address.toLowerCase() === config.registry.toLowerCase(),
    ),
  });
  return locked(async (tx) => {
    const row = (
      await rows<Claim>(
        tx,
        sql`SELECT * FROM win_claims WHERE match_id=${id} AND player_id=${player.id} AND verified=true`,
      )
    )[0];
    if (
      !row ||
      receipt.from.toLowerCase() !== row.wallet.toLowerCase() ||
      !events.some(
        (e) =>
          e.args.matchId === matchKey(id) &&
          e.args.player.toLowerCase() === row.wallet.toLowerCase() &&
          e.args.resultDigest === `0x${match.resultDigest}`,
      )
    )
      throw new Error("Win transaction does not match this race and wallet");
    await tx.execute(
      sql`UPDATE win_claims SET tx_hash=${hash} WHERE match_id=${id}`,
    );
    return { txHash: hash };
  });
}
