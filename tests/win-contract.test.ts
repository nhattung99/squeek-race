import { beforeAll, describe, expect, it } from "vitest";
import { createVM } from "@ethereumjs/vm";
import { Common, Hardfork, Mainnet, Sepolia } from "@ethereumjs/common";
import { createBlock } from "@ethereumjs/block";
import {
  createAddressFromString,
  bytesToHex,
  hexToBytes,
} from "@ethereumjs/util";
import {
  encodeAbiParameters,
  encodeFunctionData,
  decodeFunctionResult,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compileWins } from "../scripts/compile-wins";
import {
  matchKey,
  winAbi,
  winTypedData,
  type WinVoucher,
} from "../src/lib/win-protocol";
// Public, deterministic test-only keys. Never used on a public network.
const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);
const player = privateKeyToAccount(`0x${"22".repeat(32)}`);
const other = privateKeyToAccount(`0x${"33".repeat(32)}`);
let bytecode: Hex;
beforeAll(() => {
  bytecode = `0x${compileWins().evm.bytecode.object}`;
});
async function fixture(chain = Sepolia) {
  const common = new Common({ chain, hardfork: Hardfork.Cancun });
  const vm = await createVM({ common });
  const block = createBlock({ header: { timestamp: 1000n } }, { common });
  const deploy = await vm.evm.runCall({
    caller: createAddressFromString(player.address),
    data: hexToBytes(
      `${bytecode}${encodeAbiParameters([{ type: "address" }], [signer.address]).slice(2)}`,
    ),
    block,
    gasLimit: 6000000n,
  });
  const registry = deploy.createdAddress?.toString() as Address;
  async function send(
    voucher: WinVoucher,
    signature: Hex,
    from = player.address,
  ) {
    return vm.evm.runCall({
      caller: createAddressFromString(from),
      to: createAddressFromString(registry),
      block,
      gasLimit: 1000000n,
      data: hexToBytes(
        encodeFunctionData({
          abi: winAbi,
          functionName: "recordWin",
          args: [
            { ...voucher, expiresAt: BigInt(voucher.expiresAt) },
            signature,
          ],
        }),
      ),
    });
  }
  const voucher: WinVoucher = {
    matchId: matchKey("test-race"),
    player: player.address,
    resultDigest: `0x${"ab".repeat(32)}`,
    expiresAt: "1600",
  };
  return { vm, registry, deploy, voucher, send };
}
describe("compiled victory receipt contract in an isolated EVM", () => {
  it("records a signed winner once, stores the exact receipt and emits one event", async () => {
    const f = await fixture();
    expect(f.deploy.execResult.exceptionError).toBeUndefined();
    const signature = await signer.signTypedData(
      winTypedData(f.registry, f.voucher),
    );
    const recorded = await f.send(f.voucher, signature);
    expect(recorded.execResult.exceptionError).toBeUndefined();
    expect(recorded.execResult.logs).toHaveLength(1);
    const read = await f.vm.evm.runCall({
      to: createAddressFromString(f.registry),
      data: hexToBytes(
        encodeFunctionData({
          abi: winAbi,
          functionName: "wins",
          args: [f.voucher.matchId],
        }),
      ),
    });
    expect(
      decodeFunctionResult({
        abi: winAbi,
        functionName: "wins",
        data: bytesToHex(read.execResult.returnValue),
      }),
    ).toEqual([player.address, f.voucher.resultDigest]);
    expect(
      (await f.send(f.voucher, signature)).execResult.exceptionError,
    ).toBeDefined();
  });
  it("rejects forged signatures, altered results, wrong callers, expired vouchers, contract/domain replay and ETH transfers", async () => {
    const f = await fixture();
    const signed = await signer.signTypedData(
      winTypedData(f.registry, f.voucher),
    );
    const forged = await other.signTypedData(
      winTypedData(f.registry, f.voucher),
    );
    expect(
      (await f.send(f.voucher, forged)).execResult.exceptionError,
    ).toBeDefined();
    expect(
      (
        await f.send(
          { ...f.voucher, resultDigest: `0x${"cd".repeat(32)}` },
          signed,
        )
      ).execResult.exceptionError,
    ).toBeDefined();
    expect(
      (await f.send(f.voucher, signed, other.address)).execResult
        .exceptionError,
    ).toBeDefined();
    const expired = { ...f.voucher, expiresAt: "999" };
    expect(
      (
        await f.send(
          expired,
          await signer.signTypedData(winTypedData(f.registry, expired)),
        )
      ).execResult.exceptionError,
    ).toBeDefined();
    const wrongDomain = winTypedData(other.address, f.voucher);
    expect(
      (await f.send(f.voucher, await signer.signTypedData(wrongDomain)))
        .execResult.exceptionError,
    ).toBeDefined();
    const wrongChain = {
      ...winTypedData(f.registry, f.voucher),
      domain: { ...winTypedData(f.registry, f.voucher).domain, chainId: 1 },
    };
    expect(
      (await f.send(f.voucher, await signer.signTypedData(wrongChain)))
        .execResult.exceptionError,
    ).toBeDefined();
    const transfer = await f.vm.evm.runCall({
      caller: createAddressFromString(player.address),
      to: createAddressFromString(f.registry),
      value: 1n,
      skipBalance: true,
    });
    expect(transfer.execResult.exceptionError).toBeDefined();
    // Rejected attempts never consume the win.
    expect(
      (await f.send(f.voucher, signed)).execResult.exceptionError,
    ).toBeUndefined();
  });
  it("refuses deployment on mainnet", async () => {
    expect(
      (await fixture(Mainnet)).deploy.execResult.exceptionError,
    ).toBeDefined();
  });
});
