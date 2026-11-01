# IMD Swarm implementation handoff

This file is a specification for a **future authorized real IMD job**, not a job record. Do not submit it or pay without the owner's approval. Importing this repository alone does not prove program eligibility.

## Verified workflow

Read [IMD docs](https://imd.fun/docs/), [live capabilities](https://api.imd.fun/requests/capabilities) and [OpenAPI](https://api.imd.fun/openapi.json). The documented browser entry is [Explorer Launch](https://explorer.imd.fun/launch). Programmatic flow is supported action input → quote → payment challenge → wallet signatures → submit → order/job status. Use live schemas, not guessed endpoint bodies.

`job.open` opens initial work; `job.continue` continues a project paid for by the same wallet and supplies `parentJobId`. A public repository import may be checked through the documented `/requests/import` flow. Here, no repository is pushed, no request token is supplied, and no admission/payment operation is initiated. The read-only capabilities snapshot lists a 600-second quote lifetime and a 0.5 IMD job admission price; these are observations, not standing quotes or approval to spend.

The first job's payer determines ownership for Genesis linking. Verify that wallet on Genesis **before payment**. Never create the first project using an unrelated development wallet and assume it can later be reassigned.

## Proposed substantive job brief

Build and validate SqueekRace Arena using the supported IMD project/job workflow. Preserve the original arcade identity, game mechanics, free off-chain points, server authority and honest proof limits. Review the supplied Codex MVP as starting material; make real implementation, security, deployment and testing improvements with auditable IMD work.

Required tasks:

1. Re-read current official Squeekchain docs, schemas and deployment record. Resolve the documented API/Core graph mismatch with official evidence before enabling any chain-certified mode. Do not guess a replacement address.
2. Audit/extend the two-minute eligible hardware-interval engine. Verify cursor-tail semantics, inactivity coverage, timestamp boundaries and signature/provenance limitations against current docs.
3. Add a pre-fetch database ingestion lease, periodic full historical digest reconciliation and an audited correction/ordered-streak replay process.
4. Deploy a real staging PostgreSQL instance only with separately approved costs; run concurrent submission, idempotency and restore tests against the production driver.
5. Harden ingress rate limits, retention/account operations and monitoring. Preserve secure cookie authentication or implement nonce/domain/expiry/replay-protected signed-message wallet auth if explicitly requested. Never request keys.
6. Preserve playable sprint, prediction, daily, leaderboard, history/replay and all seven responsive pages. No mock scores disguised as live data.
7. Run lint, strict TypeScript, Vitest, production build, desktop/mobile Playwright and an actual hardware lock-to-settlement test. Capture genuine screenshots and a demo with disclosed waiting cuts.
8. Prepare a reviewable source change and deployment plan. Obtain explicit approval before public deployment, pushing code or additional spending.

## Acceptance

Use the requirements and test evidence in this repository. Produce genuine IMD job/project output, actual payer attribution and real verification records through IMD, never self-authored proof files. The result must remain playable when hardware is idle and fail closed on unavailable evidence. Add no token, wager, deposit, reward promise or financial transaction. Treat badge review as a separate official decision.
