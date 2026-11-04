import { keccak256 } from "viem";
import { expect, test } from "@playwright/test";
import { newRace, raceStandings, RACE_LENGTH } from "../../src/lib/race-engine";
test("finished-race UI discloses undeployed status, handles wallet rejection and fits mobile", async ({
  page,
}) => {
  // Explicit browser fixtures; no blockchain submissions and no claim of live wins.
  const snapshot = newRace(123, "WalletQA", 0, {
    available: false,
    active: false,
    energyPerTick: 25,
    installation: null,
    observedAt: null,
    rpmMilli: null,
  });
  snapshot.riders.forEach((r, i) => {
    r.finishMs = 30000 + (i === 0 ? 3 : i) * 1000;
    r.distance = RACE_LENGTH;
  });
  await page.route("**/api/races*", (route) =>
    route.fulfill({
      json: {
        match: {
          id: "10000000-0000-4000-8000-000000000001",
          serverNow: Date.now(),
          startsAt: Date.now() - 40000,
          status: "finished",
          tick: 800,
          sequence: 0,
          seed: 123,
          riders: raceStandings(snapshot),
          wheel: snapshot.wheel,
          resultDigest: "ab".repeat(32),
          version: snapshot.version,
        },
        leaderboard: [],
      },
    }),
  );
  await page.route("**/api/race-interaction", (route) =>
    route.fulfill({
      json: {
        enabled: false,
        message:
          "On-chain win recording awaits a deployed and verified Sepolia registry. Racing remains available.",
      },
    }),
  );
  await page.goto("/#play");
  const panel = page.getByRole("region", {
    name: "Sepolia contract interaction",
  });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Interact on Sepolia" }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "Interact on Sepolia" }).click();
  await expect(panel).toContainText("Sepolia interaction is not configured");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.unroute("**/api/race-interaction");
  await page.route("**/api/race-interaction", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        registry: "0x7777777777777777777777777777777777777777",
        chainId: 11155111,
      },
    }),
  );
  await page.addInitScript(() => {
    Object.defineProperty(window, "ethereum", {
      value: {
        request: async () => {
          const error = new Error("User rejected request") as Error & {
            code: number;
          };
          error.code = 4001;
          throw error;
        },
      },
    });
  });
  await page.reload();
  await expect(
    panel.getByRole("button", { name: "Interact on Sepolia" }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "Interact on Sepolia" }).click();
  await expect(panel).toContainText("User rejected");
  await expect(page.getByTestId("confirmed-race-result")).toBeVisible();
});

test("third place can send a zero-value contract interaction without token approvals", async ({
  page,
}) => {
  const address = "0x2222222222222222222222222222222222222222";
  const registry = "0x7777777777777777777777777777777777777777";
  const hash = `0x${"cd".repeat(32)}`;
  const snapshot = newRace(123, "ReceiptFixture", 0, {
    available: false,
    active: false,
    energyPerTick: 25,
    installation: null,
    observedAt: null,
    rpmMilli: null,
  });
  snapshot.riders.forEach((r, i) => {
    r.finishMs = 30000 + (i === 0 ? 3 : i) * 1000;
    r.distance = RACE_LENGTH;
  });
  await page.route("**/api/races*", (route) =>
    route.fulfill({
      json: {
        match: {
          id: "20000000-0000-4000-8000-000000000001",
          serverNow: Date.now(),
          startsAt: Date.now() - 40000,
          status: "finished",
          tick: 800,
          sequence: 0,
          seed: 123,
          riders: raceStandings(snapshot),
          wheel: snapshot.wheel,
          resultDigest: "ab".repeat(32),
          version: snapshot.version,
        },
        leaderboard: [],
      },
    }),
  );
  await page.route("**/api/race-interaction", (route) =>
    route.fulfill({
      json: { enabled: true, registry, codeHash: keccak256("0x1234") },
    }),
  );
  await page.route(
    "https://ethereum-sepolia-rpc.publicnode.com/**",
    async (route) => {
      const payload = route.request().postDataJSON();
      function result(request: { id: number; method: string }) {
        if (request.method === "eth_getCode") return "0x1234";
        if (request.method === "eth_call") return "0x";
        if (request.method === "eth_blockNumber") return "0x20";
        if (request.method === "eth_chainId") return "0xaa36a7";
        if (request.method === "eth_getTransactionReceipt")
          return {
            transactionHash: hash,
            blockHash: `0x${"ee".repeat(32)}`,
            blockNumber: "0x19",
            contractAddress: null,
            cumulativeGasUsed: "0x5208",
            effectiveGasPrice: "0x1",
            from: address,
            gasUsed: "0x5208",
            logs: [],
            logsBloom: `0x${"00".repeat(256)}`,
            status: "0x1",
            to: registry,
            transactionIndex: "0x0",
            type: "0x2",
          };
        throw new Error(`Unexpected mocked RPC method: ${request.method}`);
      }
      const respond = (request: { id: number; method: string }) => ({
        jsonrpc: "2.0",
        id: request.id,
        result: result(request),
      });
      await route.fulfill({
        json: Array.isArray(payload) ? payload.map(respond) : respond(payload),
      });
    },
  );
  await page.addInitScript(
    ({ address, hash }) => {
      const calls: { method: string; params?: unknown[] }[] = [];
      Object.defineProperty(window, "testWalletCalls", { value: calls });
      Object.defineProperty(window, "ethereum", {
        value: {
          request: async (call: { method: string; params?: unknown[] }) => {
            calls.push(call);
            if (["eth_requestAccounts", "eth_accounts"].includes(call.method))
              return [address];
            if (call.method === "eth_chainId") return "0xaa36a7";
            if (call.method === "personal_sign") return `0x${"11".repeat(65)}`;
            if (call.method === "eth_sendTransaction") return hash;
            throw new Error(`Unexpected wallet method ${call.method}`);
          },
        },
      });
    },
    { address, hash },
  );
  await page.goto("/#play");
  const panel = page.getByRole("region", {
    name: "Sepolia contract interaction",
  });
  await panel.getByRole("button", { name: "Interact on Sepolia" }).click();
  await expect(panel).toContainText(
    "Contract interaction confirmed on Sepolia",
    { timeout: 20000 },
  );
  await expect(
    panel.getByRole("link", { name: /View Sepolia transaction/ }),
  ).toHaveAttribute("href", `https://sepolia.etherscan.io/tx/${hash}`);
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as Window & {
          testWalletCalls: {
            method: string;
            params?: { to?: string; value?: string; data?: string }[];
          }[];
        }
      ).testWalletCalls,
  );
  const tx = calls.find((c) => c.method === "eth_sendTransaction")?.params?.[0];
  expect(tx?.to?.toLowerCase()).toBe(registry);
  expect(tx?.value ?? "0x0").toBe("0x0");
  expect(tx?.data?.startsWith("0x095ea7b3")).toBe(false);
  expect(calls.filter((c) => c.method === "eth_sendTransaction")).toHaveLength(
    1,
  );
});
