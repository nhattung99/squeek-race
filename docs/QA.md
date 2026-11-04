# QA record — 2026-10-31

## Optional victory receipts — 2026-11-02

68 unit/database/EVM tests pass across 12 files. The actual Solidity source is compiled and executed in an isolated Sepolia-configured EVM; duplicates, forged/modified/expired vouchers, wrong callers, domain/chain replay, ETH transfers and mainnet deployment are rejected. Isolated database tests verify session ownership, first place, wallet proof, immutable binding, verified signer responses, simulation, code/network pins and exact canonical receipt checks.

Two new Playwright tests pass using explicitly mocked wallets/RPC/results: undeployed configuration disables recording, cancellation preserves results, the mobile receipt panel fits at 390px, and the happy path sends one zero-value `recordWin` call with no token approval before confirmation. `docs/screenshots/win-receipt-mobile.png` is a synthetic UI fixture showing the undeployed state, not evidence of a public win or transaction. The existing 68-test count includes seven new contract/server tests; browser tests are additional.

Full dependency audits report zero advisories after the compiler's temporary-file dependency was patched. No real attestor secret, public signing service, deployed custom registry or public transaction has been created or tested. Local tests do not establish production readiness, IMD attribution or Genesis approval. Setup and trust limits: `ONCHAIN_WINS.md`.

## Source refusal resilience — 2026-11-01

Verified the official status and run endpoints return HTTP 200 with wildcard public CORS from the development network while deployed server requests reported HTTP 403. Added schema/freshness-validated browser telemetry strictly for display, clearly separated from server-only outcomes. Forbidden server endpoints back off for 60 seconds and use a persistent explanatory notice. No browser measurement upload or fake result path exists.

Validation: 61 unit/database tests pass, including direct-read credentials/schema/freshness checks and endpoint refusal backoff. Three targeted browser tests pass, including a clearly mocked 403 scenario that proves display fallback labeling and absence of repeated error toasts. That scenario does not claim a production source recovery. The optional trusted collector reuses the existing ingestion/scoring pipeline, requires the shared production PostgreSQL secret, and has not been run against the owner's database. Prediction recovery still requires permitted trusted server access or an owner-operated collector.

## Production Origin and database diagnostics — 2026-11-01

Production feedback showed `Invalid request origin` and a separate race API error. Origin validation now normalizes configured origins and accepts only exact current-project domains from trusted Vercel system variables, plus explicitly configured custom origins. It does not trust arbitrary Host headers or all `*.vercel.app` domains. Nine security regression cases cover canonical/deployment/branch origins, custom configuration, malformed/missing/foreign origins, spoofed hosts, production fail-closed behavior and local loopback.

`GET /api/health` reports only coarse database readiness: `DATABASE_URL_MISSING`, `DATABASE_UNAVAILABLE`, or connected. Missing PostgreSQL configuration produces an actionable 503 response instead of a generic error, and the race screen preserves the sanitized setup message. No connection string or credentials are returned. Tests: 57 unit/database tests, lint and TypeScript pass; 3 browser tests pass including same-origin registration, malicious-origin rejection and an actual-time match with persisted results. A cloud database connection has not been verified; the owner still needs to configure the Vercel Production variables and redeploy.

## Vercel build-output fix — 2026-11-01

The first cloud build exposed a phase-dependent output mismatch: the local production path was `.next-production` while the Vercel adapter expected `.next`. Vercel now uses `.next` in every config-loading phase. Five regression tests verify stable output across production/development/test on Vercel and preservation of separate local output behavior. A local build with `VERCEL=1` completed successfully and produced `.next/BUILD_ID` with `required-server-files.json.config.distDir` equal to `.next`. Remote deployment success still requires the next Vercel build; it is not inferred from this local check.

## Arcade practice follow-up — 2026-11-01

Added independent three-lane arcade practice with countdown, steering, obstacles, energy and boost. Removed the practice timer's dependency on `document.hidden` so embedded browser visibility flags cannot freeze an explicitly started race. Added distance-driven scrolling lane markings, a running pose, status and progress meter. Practice never writes ranked scores.

Validation: 33 unit/database tests pass; lint and strict TypeScript pass. Two targeted browser tests verify movement over time, scrolling road markings, steering, boost, mobile width, reset, and completion at 600 simulated metres even with `document.hidden` forced true. The completion test ran for approximately 29 seconds.

## Main race follow-up — 2026-11-01

Implemented Squeek Grand Prix with server countdown, one human and two labeled AI racers, server-timed controls and simulation, collisions, energy/boost, finish classification, persistent result receipts and a separate server race board. The client cannot supply rank, distance, points or finish time. See `RACING.md` for rules, trust limits and persistence.

The first end-to-end test caught dropped rapid left/boost combinations; a bounded serial control queue now preserves these commands while respecting server spacing. A complete actual-time browser match subsequently passed in approximately 37 seconds, including forged-result rejection, a three-racer result, mobile layout, stable receipt on repeated reads and restored results after reload. Screenshots: `main-race-mobile.png` and `main-race-results.png`. The recorded QA human finished third; no winning result was fabricated.

Unit/database coverage now includes the main race and totals 43 tests, including exact replay of persisted inputs/classification and canonical receipt verification after a PostgreSQL JSONB round-trip. Main race results do not change the verified-prediction award ledger. Cloud deployment and human multiplayer remain outside this implementation.

Final main-race validation: lint and strict TypeScript pass without warnings; all 43 unit/database tests pass; production build passes; full default Playwright suite has 5 passing tests and 1 intentionally skipped opt-in hardware-prediction test. Main-race browser coverage uses actual wall-clock server time and persistent local PostgreSQL. The owner authorized publication of the main-race follow-up to GitHub on 2026-11-01. No public deployment or cloud PostgreSQL acceptance test has been performed by this agent.

## Automated coverage

Vitest runs actual PostgreSQL through PGlite for persistence/integration tests, using isolated random directories under `.data/tests-*`. Synthetic records exist only in those tests. Real API snapshots in `docs/sources` are separate from synthetic fixtures and are never served as fallback live outcomes.

Coverage includes correct/incorrect prediction scoring, third-win bonuses, duplicate rejection, exact lock/late timestamp rejection, future window lead time, historical calibration, complete/incomplete interval counting, non-hardware/discontinuous/overlapping evidence rejection, unknown schema versions, malformed historical arrays, huge integer formatting, ETag 304 handling, HTTP-200 unavailable data, HTTP 429 backoff, session hash storage, forged sessions, real database prediction uniqueness, idempotent settlement, incomplete-round withholding, leaderboard order, daily single awards and disputed-score exclusion. Diagnostic tests parse all seven actual endpoint snapshots and prove the observed deployment identity mismatch is rejected.

Playwright checks original UI rendering, profile/avatar creation, HttpOnly/SameSite cookies, all seven routes, desktop and 390px mobile layouts, absence of horizontal overflow, mobile navigation, browser errors, missing-session/forged-score rejection, wrong-Origin rejection and protected scheduler access. Screenshots are saved in `docs/screenshots`.

The opt-in live test uses actual current official API data and real time. It registers a clearly named QA profile, locks one future prediction, rejects a duplicate, plays the actual daily challenge, waits for delayed hardware evidence, checks the award and idempotency, and opens the retained timeline replay. It never changes server time or supplies synthetic outcomes. Its observed result is saved separately as `docs/sources/live-acceptance.json` when successful.

## Commands

```sh
npm run lint
npx tsc --noEmit
npm run test
npm run build
npm run test:e2e
npm audit
```

## Issues found and fixed

- Explicit CommonJS package mode conflicted with App Router ESM modules. Switched to ESM.
- Development Origin validation used Next's normalized URL rather than the actual local host. Development now checks the request Host; production requires exact configured `APP_ORIGIN`.
- Mobile hero decoration caused a small horizontal overflow. Repositioned it; verified at 390px.
- Sprint racer briefly started at an uninitialized position during first animation. Disabled initial interpolation and moved the starting grid inside the track.
- Dialog focus handling reacted to every parent clock render. Kept a stable focus trap and a separate current close callback.
- Day-crossing daily dialogs could answer a different day's challenge. The client now submits the displayed day and the server rejects mismatches.
- Prediction timestamps now use the same server timestamp for the final lock check and stored acceptance record, after transactional feed checks.
- Detected source corrections now persist a halt and dispute ranked results instead of merely returning a temporary error.
- Raw database exceptions are not returned to browsers; public errors are allowlisted.
- Turbopack production CSS worker failed on this Windows environment. Supported Webpack production build succeeds; separate production output prevents dev/build collisions.
- npm audit identified a moderate development-only minimatch amplification advisory. Pinned patched minimatch 11 through npm overrides; rerun lint and tests to validate the transitive-tool compatibility. Production audit had no findings before this remediation; full audit reports zero after it.

## Verification limits

No production cloud PostgreSQL account, public hosting, load test, independent hardware signature verification, wallet authentication or chain-certified mode was exercised. No Ethereum transaction exists to verify. Anonymous anti-Sybil limitations and historical correction detection limits are documented. The on-chain deployment mismatch remains unresolved; the app deliberately uses separately labeled hardware API evidence. IMD ownership/payment and Genesis approval cannot be produced by local QA.

## Final results

| Check | Observed result |
|---|---|
| `npm run lint` | Pass, no warnings/errors |
| `npx tsc --noEmit` | Pass, strict mode |
| `npm run test` | 29 tests pass across four files |
| `npm run build` | Pass, Next.js 16.4.3 production Webpack build |
| Standard Playwright acceptance | 2 tests pass, desktop/mobile and API security checks |
| Opt-in actual-hardware acceptance | 1 test passes after approximately 4.4 minutes of real waiting |
| `npm audit` | Zero vulnerabilities after patched minimatch override |
| Built-server smoke test | Homepage 200, actual hardware API available, profile 200 with Secure/HttpOnly/SameSite cookie; isolated local database |
| Git preparation | Local `main` repository initialized; no commit, remote or push |

### Actual hardware observation

Test completed at 2026-10-31 13:04:04 Asia/Saigon (06:04:04 UTC). Future game interval: 13:00–13:02 local / 06:00–06:02 UTC. The server had locked the QA player's Cozy prediction before the start. Frozen ranges were 0, 1–124, and 125+ accepted passages, calibrated from 240 prior eligible windows.

The wheel was resting. Full API coverage reported zero accepted passages for that interval, so the correct future prediction earned 100 points. The actual daily historical challenge added 25 participation points. Repeated synchronization kept the profile at 125 points; the duplicate submission was rejected. The test opened History → Details and the retained replay successfully.

Evidence: `docs/sources/live-acceptance.json` and `docs/screenshots/verified-replay.png`. The result explicitly has `certifiedCoreWork: false`; it proves this application's accepted-API measurement workflow, not independent device signatures or on-chain settlement. Empty passage evidence for this resting interval is backed by the retained coverage watermark, not a claim that missing evidence equals zero. Local QA profiles visible in screenshots earned actual game awards; no fictional competitors were seeded.

Desktop and mobile screenshots were visually inspected after the final acceptance run. The mobile page has no horizontal overflow at 390px, and live source values, calibrated prediction ranges and actual QA leaderboard records are visible. No external deployment or badge submission took place.
