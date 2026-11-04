import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  encodeEventTopics,
  encodeAbiParameters,
  type Hex,
} from "viem";
import { getDb, rows } from "../src/lib/db";
import { createPlayer } from "../src/lib/game";
import { newRace, raceStandings, RACE_LENGTH } from "../src/lib/race-engine";
import { raceReceiptDigest, createMatch } from "../src/lib/races";
import {
  authorizeWin,
  confirmWin,
  createWinChallenge,
  eligibleWin,
} from "../src/lib/wins";
import { matchKey, winAbi, winTypedData } from "../src/lib/win-protocol";
vi.mock("../src/lib/squeekchain", () => ({
  getWheel: vi.fn().mockRejectedValue(new Error("test offline")),
}));
vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: vi.fn(),
}));
const wallet = privateKeyToAccount(`0x${"44".repeat(32)}`);
const other = privateKeyToAccount(`0x${"55".repeat(32)}`);
const signer = privateKeyToAccount(`0x${"66".repeat(32)}`);
const registry = "0x7777777777777777777777777777777777777777";
let player: Awaited<ReturnType<typeof createPlayer>>["player"];
let stranger: typeof player;
let id: string;
let digest: Hex;
const rpc = {
  getChainId: vi.fn().mockResolvedValue(11155111),
  getBlockNumber: vi.fn().mockResolvedValue(20n),
  getCode: vi.fn().mockResolvedValue("0x1234"),
  readContract: vi.fn(),
  simulateContract: vi.fn().mockResolvedValue({}),
  getTransactionReceipt: vi.fn(),
  getBlock: vi.fn().mockResolvedValue({ hash: `0x${"ab".repeat(32)}` }),
};
beforeAll(async () => {
  process.env.ARENA_DATA_DIR = `.data/tests-wins-${randomUUID()}`;
  delete process.env.DATABASE_URL;
  player = (await createPlayer("WinReceiptQA", 0)).player;
  stranger = (await createPlayer("WinStrangerQA", 1)).player;
  // Explicit synthetic server records, isolated test DB; never production/live data.
  const match = await createMatch(player);
  id = match.id;
  const snapshot = newRace(1, player.nickname, 0, {
    available: false,
    active: false,
    energyPerTick: 25,
    installation: null,
    observedAt: null,
    rpmMilli: null,
  });
  snapshot.riders.forEach((r, i) => {
    r.finishMs = 30000 + i * 1000;
    r.distance = RACE_LENGTH;
  });
  const classification = raceStandings(snapshot);
  digest = `0x${raceReceiptDigest({ classification })}`;
  await (
    await getDb()
  ).execute(
    sql`UPDATE race_matches SET status='finished',snapshot=${JSON.stringify(snapshot)}::jsonb WHERE id=${id}`,
  );
  await (
    await getDb()
  ).execute(
    sql`INSERT INTO race_results(match_id,player_id,rank,finish_ms,hits,classification,evidence,digest,finished_at) VALUES(${id},${player.id},1,30000,0,${JSON.stringify(classification)}::jsonb,'{}'::jsonb,${digest.slice(2)},${Date.now()})`,
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function configure() {
  const { keccak256 } = await import("viem");
  for (const [k, v] of Object.entries({
    WIN_REGISTRY_ADDRESS: registry,
    WIN_ATTESTOR_ADDRESS: signer.address,
    WIN_REGISTRY_CODE_HASH: keccak256("0x1234"),
    SEPOLIA_RPC_URL: "https://rpc.invalid",
    WIN_SIGNER_URL: "https://signer.invalid/attest",
    WIN_SIGNER_TOKEN: "test-only-token",
    APP_ORIGIN: "https://arena.invalid",
  }))
    vi.stubEnv(k, v);
  vi.mocked(createPublicClient).mockReturnValue(
    rpc as unknown as ReturnType<typeof createPublicClient>,
  );
  rpc.readContract.mockImplementation(
    async ({ functionName }: { functionName: string }) =>
      functionName === "attestor"
        ? signer.address
        : [
            "0x0000000000000000000000000000000000000000",
            `0x${"00".repeat(32)}`,
          ],
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const { voucher } = JSON.parse(String(init.body));
      return Response.json({
        signature: await signer.signTypedData(winTypedData(registry, voucher)),
      });
    }),
  );
}
describe("server-authoritative victory recording", () => {
  it("requires configured registry, ownership and a finished first-place match", async () => {
    await expect(
      createWinChallenge(player, id, wallet.address),
    ).rejects.toThrow("not configured");
    await expect(eligibleWin(stranger, id)).rejects.toThrow("not found");
    await configure();
    const unfinished = await createMatch(stranger);
    await expect(
      createWinChallenge(stranger, unfinished.id, wallet.address),
    ).rejects.toThrow("first-place");
  });
  it("rejects wrong signatures and expired challenges; binds the winning wallet once", async () => {
    await configure();
    const challenge = await createWinChallenge(player, id, wallet.address);
    expect(challenge.message).toContain("https://arena.invalid");
    expect(challenge.message).toContain(id);
    await expect(
      authorizeWin(
        player,
        id,
        await other.signMessage({ message: challenge.message }),
      ),
    ).rejects.toThrow("invalid or expired");
    await (
      await getDb()
    ).execute(sql`UPDATE win_claims SET expires=0 WHERE match_id=${id}`);
    await expect(
      authorizeWin(
        player,
        id,
        await wallet.signMessage({ message: challenge.message }),
      ),
    ).rejects.toThrow("invalid or expired");
    const renewed = await createWinChallenge(player, id, wallet.address);
    expect(renewed.message).not.toBe(challenge.message);
    const authorized = await authorizeWin(
      player,
      id,
      await wallet.signMessage({ message: renewed.message }),
    );
    expect(authorized.recorded).toBe(false);
    if (!authorized.recorded) {
      expect(authorized.voucher.resultDigest).toBe(digest);
      expect(authorized.voucher.matchId).toBe(matchKey(id));
    }
    expect(rpc.simulateContract).toHaveBeenCalled();
    await expect(createWinChallenge(player, id, other.address)).rejects.toThrow(
      "another wallet",
    );
    // A repeat issues the same match key, not another eligible win.
    expect((await authorizeWin(player, id)).recorded).toBe(false);
  });
  it("rejects wrong RPC chain, altered bytecode and forged attestor signatures", async () => {
    await configure();
    rpc.getChainId.mockResolvedValueOnce(1);
    await expect(authorizeWin(player, id)).rejects.toThrow("network mismatch");
    rpc.getCode.mockResolvedValueOnce("0x5678");
    await expect(authorizeWin(player, id)).rejects.toThrow("code mismatch");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const { voucher } = JSON.parse(String(init.body));
        return Response.json({
          signature: await other.signTypedData(winTypedData(registry, voucher)),
        });
      }),
    );
    await expect(authorizeWin(player, id)).rejects.toThrow(
      "verification failed",
    );
  });
  it("verifies canonical success, sender, contract and exact event before persisting tx hash idempotently", async () => {
    await configure();
    const hash = `0x${"cd".repeat(32)}` as Hex;
    const receipt = {
      transactionHash: hash,
      from: wallet.address,
      to: registry,
      status: "success",
      blockNumber: 19n,
      blockHash: `0x${"ab".repeat(32)}`,
      logs: [
        {
          address: registry,
          topics: encodeEventTopics({
            abi: winAbi,
            eventName: "WinRecorded",
            args: { matchId: matchKey(id), player: wallet.address },
          }),
          data: encodeAbiParameters([{ type: "bytes32" }], [digest]),
        },
      ],
    };
    rpc.getTransactionReceipt.mockResolvedValue({
      ...receipt,
      status: "reverted",
    });
    await expect(confirmWin(player, id, hash)).rejects.toThrow("confirmations");
    rpc.getTransactionReceipt.mockResolvedValue({
      ...receipt,
      from: other.address,
    });
    await expect(confirmWin(player, id, hash)).rejects.toThrow(
      "does not match",
    );
    rpc.getTransactionReceipt.mockResolvedValue({ ...receipt, logs: [] });
    await expect(confirmWin(player, id, hash)).rejects.toThrow(
      "does not match",
    );
    rpc.getTransactionReceipt.mockResolvedValue(receipt);
    rpc.getBlock.mockResolvedValueOnce({ hash: `0x${"ef".repeat(32)}` });
    await expect(confirmWin(player, id, hash)).rejects.toThrow("canonical");
    expect(await confirmWin(player, id, hash)).toEqual({ txHash: hash });
    expect(await confirmWin(player, id, hash)).toEqual({ txHash: hash });
    const claims = await rows<{ tx_hash: string }>(
      await getDb(),
      sql`SELECT tx_hash FROM win_claims WHERE match_id=${id}`,
    );
    expect(claims).toEqual([{ tx_hash: hash }]);
  });
});
