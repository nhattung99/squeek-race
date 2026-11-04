# Sepolia victory receipts

The owner deployed the custom registry on Sepolia. The current Grand Prix interface offers a zero-value match lookup transaction after any finish. See [deployment](DEPLOYMENT.md) for the two public configuration variables. The separate first-place attestation API below remains available for development and requires a signer.

This is an independent SqueekRace Arena contract, not an official Squeekchain reward mechanism. No SQK, NFT, deposits, allowances, wagering or transferable points are involved. Sepolia ETH is needed only for the player's transaction gas. This feature does not establish IMD attribution or Genesis approval.

## Player flow

1. Finish a Grand Prix in first place against the two disclosed AI racers. The server persists the result and SHA-256 evidence digest.
2. Click **Record win on-chain**. Connect a browser wallet and switch to Sepolia (11155111).
3. Sign a human-readable wallet-binding message containing the application origin, chain ID, match UUID, random nonce and five-minute expiry. This is not a transaction and grants no allowance. The match is reserved to that wallet when its challenge is created; the UI does not silently change the beneficiary.
4. Server checks session ownership and completed first place, verifies the wallet signature and freezes the binding. A separate operator service independently checks the persisted result, wallet proof and digest before signing an EIP-712 voucher.
5. The server checks RPC chain ID, pinned deployed runtime hash and contract attestor at one block, verifies the returned voucher signature and simulates `recordWin` from the player's wallet. The browser also simulates before requesting a wallet transaction.
6. Player confirms the zero-value `recordWin` transaction in their own wallet. Cancelling leaves their race result intact.
7. The UI waits for two confirmations. Server checks receipt success, canonical block hash, registry destination, sender and exact `WinRecorded` event before saving its transaction hash. Two confirmations are a testnet UX threshold, not irreversible finality.

One `matchId = keccak256(UTF8(match UUID))` can be recorded once per registry. Signed fields are matchId, player, resultDigest and expiresAt; the EIP-712 domain binds name, version, chain ID and contract. A 10-minute voucher can be renewed for the same bound wallet. Concurrent vouchers cannot create multiple on-chain records. Front-running from a different wallet fails because `msg.sender` must equal player. The registry accepts no payable actions and has no token interactions.

The blockchain **trusts the game attestor** to certify first place; it does not replay the race or certify hamster hardware. Official wheel telemetry remains a disclosed race energy input when available. The API is not used to infer token rewards or transaction eligibility.

## Operator setup — do not paste secrets into chat

The signing service is deliberately separate from the Vercel game. It holds a dedicated, newly created **attestation-only** EOA key, never a player's wallet, Genesis wallet, seed phrase or funded personal wallet. This account signs vouchers and needs no gas. Use an operator-managed secrets store for production; the included loopback service is a testnet reference implementation, not a managed KMS.

1. Run `npm ci`, `npm run contracts:compile`, and `npm run test`. Compiler settings are recorded in `artifacts/SqueekRaceWins.json` (ignored in Git); dependencies are locked by `package-lock.json`. Review `contracts/SqueekRaceWins.sol`. No deployment occurs.
2. Create the isolated attestor under your own secure environment and retain its **public address**. Never give its private key to Codex. The key is not the wallet that signs player receipts or pays for deployment.
3. After explicitly approving deployment, deploy the reviewed contract on **Sepolia only**, passing that public attestor address to its constructor. Use your own wallet; no deployment action is automated here. Publish/verify the exact source, constructor arguments, compiler version, optimizer (200 runs) and Cancun EVM setting in an explorer. Retain the deployment transaction and canonical address.
4. Independently verify the deployed source and immutable attestor before pinning the runtime `keccak256(eth_getCode(registry))` in `WIN_REGISTRY_CODE_HASH`. Do not blindly pin arbitrary code from an unreviewed address. This registry is a direct immutable deployment, not a proxy. A compromised attestor requires a reviewed replacement deployment; there is no hidden admin that changes past wins.
5. Provision an isolated signer host that can access the same production PostgreSQL database. Give its dedicated DB role only `SELECT` on `race_results` and `win_claims` after the application creates these tables. The signer does not run schema DDL and requests read-only sessions. Its database URL uses the same database as Vercel but should use this separate read-only role, not the application's write-capable credentials. The game creates the receipt table during its first eligible challenge; use the app's owner/migration role for schema setup, never the signer role.
6. On **that host only**, configure ignored `.env.signer.local` with `DATABASE_URL`, `WIN_ATTESTOR_PRIVATE_KEY`, `WIN_ATTESTOR_ADDRESS`, `WIN_REGISTRY_ADDRESS`, and a random `WIN_SIGNER_TOKEN` of at least 32 characters. The private key format is 0x plus 64 hexadecimal characters. Never commit or share this file. Run `npm run wins:signer`. It binds 127.0.0.1:8787 and accepts authenticated POST `/attest`; use an HTTPS reverse proxy/private service boundary with request-size, timeout and rate limits. Do not expose the loopback port directly. No browser CORS access is needed. Database errors and rejected request bodies are not logged.
7. On the Vercel application, configure Production variables:

| Variable | Value |
| --- | --- |
| `APP_ORIGIN` | Canonical game origin, currently https://squeek-race.vercel.app |
| `DATABASE_URL` | Existing real PostgreSQL URL |
| `SEPOLIA_RPC_URL` | Trusted Sepolia JSON-RPC endpoint |
| `WIN_REGISTRY_ADDRESS` | Reviewed, deployed custom registry address |
| `WIN_REGISTRY_CODE_HASH` | Independently verified runtime bytecode hash |
| `WIN_ATTESTOR_ADDRESS` | Dedicated public attestor address |
| `WIN_SIGNER_URL` | HTTPS endpoint of your isolated signer, ending `/attest` |
| `WIN_SIGNER_TOKEN` | Same random bearer secret as the signer |

**Never set `WIN_ATTESTOR_PRIVATE_KEY` on the Vercel game.** No secrets have a `NEXT_PUBLIC_` prefix. Vercel configuration changes require a new deployment; deployment remains an owner-approved action.

8. Verify `/api/wins` reports enabled, complete an actual first-place race, then connect your own wallet and test recording with test ETH. Check the exact event and database transaction hash. Test cancellation, duplicate recording and reload after a pending transaction. Until this live smoke test is performed, report the integration as locally tested, not deployed or production verified.

## Signer protocol

Authenticated `POST /attest`, `Authorization: Bearer <operator secret>`, JSON:

```text
{ id: <race UUID>, registry: <reviewed registry>, voucher: {
  matchId: <keccak UUID>, player: <bound winning wallet>,
  resultDigest: <0x SHA-256 server receipt>, expiresAt: <unix seconds string>
} }
```

Response: `{ signature: <65-byte EIP-712 signature> }`. The included service permits only the configured registry, correct match hash, short validity and an independently queried completed rank-1 result with a verified wallet binding. The Vercel server cryptographically validates the response before returning it to the browser. Keep this endpoint out of browser-facing code. A key compromise, database compromise or game-server compromise remains a trust risk; this is not a trustless competition.

## Recovery and limits

- Wallet binding is for each winning match, not a full wallet login system. Anonymous profiles retain their existing anti-abuse limits and are not Sybil resistant. Losing the anonymous session can prevent later claim access.
- Pending transaction hashes in sessionStorage are **hints only**, never authoritative results. Reloads in the same browser tab offer **Check transaction**. The contract, canonical receipts and server checks determine success. Never automatically resubmit after a timeout. If a transaction is dropped, investigate it before clearing the hint; replacing/cancelling transactions may require owner support.
- Previously recorded wins are checked on-chain when reopening the claim flow; a cached DB hash alone is not proof. Reorganizations can remove a recent transaction. The UI's two-confirmation display is not an ongoing finality monitor.
- No public submission, contract deployment, signer hosting, external subscription, secret generation, wallet signature or payment is performed by this implementation task.

## Validation

`tests/win-contract.test.ts` compiles the actual Solidity source and executes it in an isolated EthereumJS EVM. Tests cover recording and event/state integrity, duplicates, false signatures, altered outcomes, incorrect callers, expired vouchers, contract/chain replay, ETH rejection and mainnet deployment rejection. `tests/wins.test.ts` uses an isolated PostgreSQL instance and mocked RPC/attestor responses to test server ownership, first-place requirements, nonce expiry, wallet binding, simulation, bytecode/network checks, forgery rejection and canonical receipt verification. `tests/e2e/wins.spec.ts` uses explicit synthetic UI fixtures and a rejecting injected wallet; no test submits public transactions.

Cryptographic building blocks follow [OpenZeppelin EIP712/ECDSA](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography) and [EIP-712](https://eips.ethereum.org/EIPS/eip-712). The unrelated community site's SQK `approve(self,0)` ping is not used as a victory receipt.
