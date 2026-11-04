# SqueekRace Arena

**Race, Predict & Play with Squeektoshi's Real-World Wheel Activity**

A playable Next.js game with original hamster racers, a real wheel-driven sprint, future hardware-interval predictions, a daily history challenge, server profiles, evidence replays, and a persistent community leaderboard. Free, non-transferable, off-chain points only.

## Run locally

Requires Node.js 22+ and npm. Tested with Node 24 on Windows.

```sh
npm ci
npm run dev
```

Open [the local arena](http://127.0.0.1:3000). No database service is needed locally: PGlite runs real PostgreSQL in the server process and persists to `.data/postgres`. Use one local server process per database directory. PostgreSQL via `DATABASE_URL` is mandatory on Vercel. Do not copy `.data` to a public repository.

The app synchronizes official hardware history in batches (six pages, at least 550 ms apart) every 15 seconds while open. First catch-up can take several minutes. Ranked predictions remain unavailable until coverage reaches the head. The daily history challenge becomes available after at least 12 eligible windows and three active samples exist. API failure is shown as unknown, never fictional activity.

## Play

**Main race — Squeek Grand Prix:** at `/#play`, create a profile and start a server match against two labeled AI racers. Three-second countdown, lane steering, obstacles, energy, boost, finish times and final ranking are calculated by the server. Results persist through refresh and appear on a separate racing board. Use Left/Right or A/D and Space, or touch controls. See [server racing rules](docs/RACING.md). This is AI competition, not human multiplayer.

**Arcade Sprint practice:** play immediately with a countdown, three lanes, obstacles, energy pickups and boost. Use Left/Right or A/D to steer and Space to boost, or the mobile buttons. This simulated practice race works while the real hamster rests. It awards no leaderboard points and does not alter verified prediction results.

1. Choose a hamster avatar and nickname. The server issues an HttpOnly anonymous session cookie.
2. **Predict the Wheel:** pick zero, moderate, or high accepted passages in a future two-minute window. Ranges freeze from prior hardware measurements. Lock before the start.
3. **Hamster Sprint:** start a visual race to 60 new accepted passages. Wheel rests pause progress. This mode awards no ranked points.
4. **Daily Challenge:** classify a real completed interval. Earn 25 participation points once per UTC day; historical guesses do not inflate prediction accuracy.
5. Review history and replay the exact stored passage counts in compressed time.

Correct future predictions earn 100 points. Every third consecutive correct prediction adds 50. The leaderboard never accepts scores from the browser or localStorage.

## Integrity and scope

If the official source returns HTTP 403 to Vercel, public CORS telemetry can be read directly for display only. It never supplies scores or race outcomes. Trusted prediction ingestion still requires permitted server access. An owner-only collector (`npm run source:sync -- --watch`) can run the same ingestion pipeline on a permitted trusted host against the shared PostgreSQL database; it has not been provisioned or launched automatically. See [source access and recovery](docs/SOURCE_ACCESS.md).

- Predictions lock using server time, transaction serialization and a unique `(player, round)` constraint.
- Outcomes require complete API hardware coverage, eligible provenance, no discontinuity inside the interval, and unique passage timestamps. Scoring waits two minutes after the interval.
- Sources, retrieval times, segment IDs, SHA-256 digests, frozen ranges and rule version are retained. Awards are idempotent.
- These are **API-verified hardware measurements, not SqueekCore-certified work**. Device signatures are not independently verified by this app.
- On 2026-10-31, the live API Core address differed from the official deployment record. Chain-certified modes are intentionally not enabled. See [research](docs/RESEARCH.md).
- Anonymous cookies and rate limits reduce casual abuse; this is not full Sybil resistance. Losing the cookie loses access to the profile. No wallet login is implemented.
- This is a local development MVP with production setup instructions, not a deployed or officially approved service. Operational acceptance still requires production PostgreSQL, a trusted proxy, scheduling, backups and monitoring.

## Checks

```sh
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Browser tests use an already running local server at `http://127.0.0.1:3000`:

```sh
npx playwright install chromium
npm run test:e2e
```

Opt-in live test (waits for actual future hardware data, up to eight minutes), PowerShell:

```powershell
$env:LIVE_ACCEPTANCE='1'
npx playwright test tests/e2e/live.spec.ts
Remove-Item Env:LIVE_ACCEPTANCE
```

Unit and PostgreSQL tests use clearly synthetic fixtures in isolated `.data/tests-*` databases. Actual API snapshot tests read `docs/sources/*.json`. Live results are never substituted with these test fixtures.

The production build uses Next.js's supported Webpack option because this Windows environment's Turbopack build worker failed during CSS process initialization. Development still uses Turbopack.

## Repository map

| Location | Purpose |
|---|---|
| `src/app` | App Router pages, HTTP routes and styling |
| `src/components` | Game UI, original SVG art, shadcn-style Button and evidence replay |
| `src/lib/squeekchain.ts` | Validated typed API client, freshness, ETag and rate-limit handling |
| `src/lib/diagnostics.ts` | Typed reads for other investigated endpoints and identity mismatch detection |
| `src/lib/rules.ts` | Pure deterministic rules and interval measurement |
| `src/lib/game.ts` | Server ingestion, round lifecycle, profiles, predictions, awards and leaderboard |
| `src/lib/db.ts` | Drizzle ORM, persistent PostgreSQL schema and transaction guard |
| `tests` | Unit, real PostgreSQL integration, API failure and browser tests |
| `docs` | Research, architecture, rules, deployment and Genesis/IMD handoff |

## Deployment and attribution

Optional first-place **Sepolia victory receipts** are implemented behind operator configuration. See [on-chain win setup and trust model](docs/ONCHAIN_WINS.md). They require a separately deployed custom registry and isolated attestation service; neither has been deployed by this task. The wallet sends a zero-value record transaction after simulation, and pays testnet gas. There are no SQK rewards. Run `npm run contracts:compile` to build the reviewed contract artifact locally.

Read [deployment](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), [rules](docs/GAME_RULES.md), [API integration](docs/API_INTEGRATION.md), [demo](docs/DEMO.md), [QA](docs/QA.md) and [Genesis submission](docs/GENESIS_SUBMISSION.md).

This version was developed in Codex. **Codex code alone does not establish IMD attribution.** Source publication to [the owner's GitHub repository](https://github.com/nhattung99/squeek-race) is authorized. No IMD job, payment, verified job-owner attribution, badge approval or public deployment has been created by this agent. The official skill installed successfully under `.agents/skills/squeekchain`; it is excluded from source publication because its documentation is proprietary. Its guidance was read during this session; a new Codex turn can discover the installed skill.

## Official sources

[Squeekchain](https://squeekchain.com/) · [Developer API](https://docs.squeekchain.com/developers/api/) · [Build with AI](https://docs.squeekchain.com/developers/build-with-ai/) · [Genesis Code](https://squeekchain.com/genesis/code) · [IMD documentation](https://imd.fun/docs/)

Original application code and art are released under the MIT license in `LICENSE`. Third-party dependencies retain their own licenses. The ignored downloaded official documentation and source bundles are not relicensed and must not be published as application source.
