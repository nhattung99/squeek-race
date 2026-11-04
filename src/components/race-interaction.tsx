"use client";
import { useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  keccak256,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { matchKey, winAbi, winChain } from "@/lib/win-protocol";
import { Button } from "./ui/button";

export function RaceInteraction({ id }: { id: string }) {
  const [hash, setHash] = useState<Hex | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const running = useRef(false);

  async function interact() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    let submitted = hash;
    const client = createPublicClient({ chain: winChain, transport: http() });
    try {
      if (!submitted) {
        const config = await fetch("/api/race-interaction", {
          cache: "no-store",
        }).then((r) => r.json());
        if (!config.enabled)
          throw new Error("Sepolia interaction is not configured.");
        const provider = (window as Window & { ethereum?: EIP1193Provider })
          .ethereum;
        if (!provider)
          throw new Error(
            "Open the game in a browser with a wallet extension.",
          );
        const wallet = createWalletClient({
          chain: winChain,
          transport: custom(provider),
        });
        const [account] = await wallet.requestAddresses();
        if (!account) throw new Error("Select an account in your wallet.");
        if ((await wallet.getChainId()) !== winChain.id)
          await wallet.switchChain({ id: winChain.id });
        if (
          (await wallet.getChainId()) !== winChain.id ||
          (await client.getChainId()) !== winChain.id
        )
          throw new Error("Select Ethereum Sepolia.");
        const code = await client.getCode({ address: config.registry });
        if (!code || keccak256(code).toLowerCase() !== config.codeHash)
          throw new Error("The deployed contract could not be verified.");
        const data = encodeFunctionData({
          abi: winAbi,
          functionName: "wins",
          args: [matchKey(id)],
        });
        await client.call({ account, to: config.registry, data, value: 0n });
        setMessage(
          "Review the zero-value Sepolia transaction and gas in your wallet.",
        );
        submitted = await wallet.sendTransaction({
          account,
          to: config.registry,
          data,
          value: 0n,
        });
        setHash(submitted);
      }
      setMessage("Waiting for Sepolia confirmation…");
      const receipt = await client.waitForTransactionReceipt({
        hash: submitted,
        confirmations: 2,
        timeout: 90000,
      });
      setHash(receipt.transactionHash);
      setConfirmed(true);
      setMessage(
        receipt.status === "success"
          ? "Contract interaction confirmed on Sepolia."
          : "The Sepolia transaction reverted.",
      );
    } catch (error) {
      setMessage(
        submitted
          ? "Confirmation is unavailable. Check the same transaction again."
          : error instanceof Error
            ? error.message.split("\n")[0]
            : "Wallet request could not be completed.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Sepolia contract interaction"
      className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-4 space-y-3"
    >
      <h3>Interact with the Sepolia contract</h3>
      <p className="text-sm">
        Your race is complete. Send an optional 0 ETH transaction that queries
        this match. Sepolia gas applies. Your race result stays in the game.
      </p>
      <Button disabled={busy || confirmed} onClick={() => void interact()}>
        {busy
          ? "Processing…"
          : hash
            ? "Check transaction"
            : "Interact on Sepolia"}
      </Button>
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
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
    </section>
  );
}
