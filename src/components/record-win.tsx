"use client";
import { useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { winChain as sepolia } from "@/lib/win-protocol";
import { winAbi, type WinVoucher } from "@/lib/win-protocol";
import { Button } from "./ui/button";
type Authorization =
  | { recorded: true; registry: `0x${string}`; txHash: Hex | null }
  | {
      recorded: false;
      registry: `0x${string}`;
      voucher: WinVoucher;
      signature: Hex;
    };
async function request(body: unknown) {
  const response = await fetch("/api/wins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Win recording failed");
  return data;
}
export function RecordWin({ id }: { id: string }) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("Checking Sepolia win recording…");
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [hash, setHash] = useState<Hex | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/wins", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setEnabled(data.enabled === true);
        setMessage(
          data.enabled
            ? "Optional Sepolia receipt · no tokens or rewards · test ETH gas required."
            : data.message,
        );
        try {
          const pending = sessionStorage.getItem(`win-pending:${id}`);
          if (pending && /^0x[0-9a-fA-F]{64}$/.test(pending))
            setHash(pending as Hex);
        } catch {
          /* Storage is only a pending transaction hint. */
        }
      })
      .catch(() => {
        if (alive) setMessage("Win recording is temporarily unavailable.");
      });
    return () => {
      alive = false;
    };
  }, [id]);
  async function record() {
    setBusy(true);
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http("https://ethereum-sepolia-rpc.publicnode.com", {
        timeout: 15000,
      }),
    });
    let submitted = hash;
    try {
      if (!submitted) {
        const provider = (window as Window & { ethereum?: EIP1193Provider })
          .ethereum;
        if (!provider)
          throw new Error(
            "Install a browser wallet such as MetaMask or Rabby to record your win.",
          );
        const wallet = createWalletClient({
          chain: sepolia,
          transport: custom(provider),
        });
        setMessage(
          "Connect your wallet. A message signature binds it to this winning match.",
        );
        const [address] = await wallet.requestAddresses();
        if (!address) throw new Error("No wallet selected");
        if ((await wallet.getChainId()) !== sepolia.id)
          await wallet.switchChain({ id: sepolia.id });
        if ((await wallet.getChainId()) !== sepolia.id)
          throw new Error("Switch your wallet to Sepolia first.");
        const challenge = await request({
          kind: "challenge",
          id,
          wallet: address,
        });
        const signature = challenge.verified
          ? undefined
          : await wallet.signMessage({
              account: address,
              message: challenge.message,
            });
        setMessage(
          "Server is verifying the win and simulating the Sepolia transaction…",
        );
        const authorization: Authorization = await request({
          kind: "authorize",
          id,
          ...(signature ? { signature } : {}),
        });
        if (authorization.recorded) {
          setRecorded(true);
          setHash(authorization.txHash);
          setMessage("This win is already recorded on Sepolia.");
          return;
        }
        const { voucher } = authorization;
        if (getAddress(voucher.player) !== getAddress(address))
          throw new Error("The win is bound to a different wallet.");
        const args = [
          { ...voucher, expiresAt: BigInt(voucher.expiresAt) },
          authorization.signature,
        ] as const;
        await publicClient.simulateContract({
          address: authorization.registry,
          abi: winAbi,
          functionName: "recordWin",
          args,
          account: address,
        });
        const [current] = await wallet.getAddresses();
        if (
          current?.toLowerCase() !== address.toLowerCase() ||
          (await wallet.getChainId()) !== sepolia.id
        )
          throw new Error("Wallet account or network changed. Please retry.");
        setMessage(
          "Simulation passed. Confirm Record win in your wallet: 0 ETH value, Sepolia gas only.",
        );
        submitted = await wallet.writeContract({
          address: authorization.registry,
          abi: winAbi,
          functionName: "recordWin",
          args,
          account: address,
        });
        setHash(submitted);
        try {
          sessionStorage.setItem(`win-pending:${id}`, submitted);
        } catch {
          /* Never authoritative. */
        }
      }
      setMessage(
        "Transaction submitted. Waiting for two Sepolia confirmations…",
      );
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: submitted,
        confirmations: 2,
        timeout: 120000,
      });
      if (receipt.status !== "success") {
        setHash(null);
        try {
          sessionStorage.removeItem(`win-pending:${id}`);
        } catch {
          /* optional */
        }
        throw new Error(
          "The transaction reverted. No win was recorded. Review the transaction before retrying.",
        );
      }
      const confirmed = await request({
        kind: "confirm",
        id,
        hash: receipt.transactionHash,
      });
      setHash(confirmed.txHash);
      setRecorded(true);
      setMessage("Win recorded on Sepolia and confirmed by the server.");
      try {
        sessionStorage.removeItem(`win-pending:${id}`);
      } catch {
        /* optional */
      }
    } catch (error) {
      const rejected =
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 4001;
      setMessage(
        rejected
          ? "Wallet request cancelled. Your race result is saved."
          : submitted
            ? "Confirmation is pending or unavailable. Use Check transaction; do not submit a second transaction."
            : error instanceof Error
              ? error.message.slice(0, 240)
              : "Win recording failed. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-4 space-y-3"
      data-testid="record-win"
    >
      <h3>Record your victory on Sepolia</h3>
      <p className="text-sm" role="status">
        {message}
      </p>
      <p className="text-xs opacity-70">
        Records the server-attested result of this AI race. It does not
        independently verify gameplay or award SQK.
      </p>
      <Button
        disabled={!enabled || busy || recorded}
        onClick={() => void record()}
      >
        {busy
          ? "Processing…"
          : recorded
            ? "Win recorded"
            : hash
              ? "Check transaction"
              : "Record win on-chain"}
      </Button>
      {hash && (
        <a
          className="block text-sm underline"
          href={`https://sepolia.etherscan.io/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View Sepolia transaction ↗
        </a>
      )}
    </div>
  );
}
