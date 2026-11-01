# Verified research — 2026-10-31

## Method and provenance

Read the official complete developer documentation, API page, quickstart, build-with-AI guide, skill references, deployment record, published response schemas, Genesis Code client content and IMD documentation. Made read-only requests to all seven requested endpoints. Actual responses are stored under `docs/sources/*.json`; documentation and website source downloads are local research material excluded from Git.

Sources: [full docs](https://docs.squeekchain.com/llms-full.txt), [API reference](https://docs.squeekchain.com/developers/api/), [quickstart](https://docs.squeekchain.com/developers/quickstart/), [deployment record](https://docs.squeekchain.com/assets/deployments/sepolia.json), [AI guide](https://docs.squeekchain.com/developers/build-with-ai/).

## Official skill

The first requested `npx skills add https://docs.squeekchain.com` attempt was blocked by sandbox network/DNS. Retried with network permission and explicit noninteractive Codex flags:

```sh
npx --yes skills add https://docs.squeekchain.com --agent codex --yes
```

CLI verified discovery and reported 52 files installed in `.agents/skills/squeekchain`. Read `SKILL.md`, API references, deployment record and related guidance. Source revision: `89ecd8f1f54f5c5bef89660c070eb54b34ef8509`; deployment label `squeeks-sepolia-core3-mining6-001`. The installed file exists. Codex is officially listed as supported. No claim of unsupported automatic IMD execution is made.

## Endpoint findings

| Endpoint | Confirmed schema | Findings and gameplay use |
|---|---|---|
| `/v1/status` | `1` | `measurement` can be null. Actual data has hardware provenance, online freshness, `IDLE` state, `counterEpoch`, cumulative work, RPM thousandths and distance mm. Drives sprint only while fresh. |
| `/v1/measurement/runs?limit=100&cursor=…` | `measurement-runs.v1` | Oldest-first accepted device-signed segments; exact passage timestamps, `workUnits`, continuity/discontinuity, provenance, eligibility, coverage and opaque cursor. `authority=pi-device-key`, `certifiedCoreWork=false`. Primary measurement gameplay source. |
| `/v1/measurement/blocks` | `game-block-projection.v1` | Optimistic block projection with anchor, schedule, threshold crossings and up to 120 blocks. Not finalized; no SQK issuance implied. Diagnostic only. |
| `/v1/measurement/stats?range=7d` | `1` | 7d or 30d, accepted-round aggregates, 1800-second buckets, coverage labels and activity records. Missing buckets have null work. Useful for analysis; not used to score exact two-minute windows. |
| `/v1/core` | `1` | Safe chain state, identities, configuration, implementation and latest events. Current identity does not match deployment record; not trusted as verified contract state. |
| `/v1/settlements?range=7d` | `3` | Latest ten settlements that completed blocks, not exhaustive history and not all zero-work closures. No cursor supported. Settlement and later issuance are separate. |
| `/v1/events?limit=5` | `3` | Newest-first, categories `all`, `protocol`, `players`, `measurement`, opaque cursor; chain events include block hash/tx/log position and safe confirmation status. Diagnostic only. |

The typed field subsets for all seven endpoints are exercised against actual snapshots. Unknown additional fields are tolerated; breaking schema versions are rejected for operational reads. Raw API JSON is never injected as HTML.

## Material identity mismatch

The official deployment record names Core `0x74665dAecA35A2303e767E76a2FF1FB6F93e119f`. The actual `/core` snapshot names `0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44`, with implementation `0x284747c4664af2203e7a90a2ee76f22b6b5e6889`. Its runtime hash and configuration also differ from the deployment record. The live block projection follows the API deployment. This is not reconciled here, and API addresses are not substituted into contract calls.

Consequently, no on-chain mode or transaction is implemented. The measurement alternative does not depend on either contract graph. It accurately labels its authority as accepted hardware API evidence, never certified Core work, final chain settlement, or independently verified physical truth. A future on-chain mode requires a corrected official deployment record and the complete quickstart verification at one Ethereum block.

## Units, timing and completeness

- Work unit: one accepted wheel-magnet passage. Do not infer a full revolution per passage or convert directly to distance.
- `rpmMilli` is RPM / 1000; `speedMmPerSecond` is mm/s; `distanceMm` is mm; `offsetNs` and `boundaryGapNs` are ns; `maxGapMs` is ms.
- Large numeric fields are unsigned decimal strings. Cumulative counters and thresholds use `BigInt`. JSON transports them as strings. Only bounded display ratios/counts use JavaScript numbers.
- Device timestamps are UTC ISO 8601, including microseconds. Gameplay windows start on exact whole seconds, so millisecond parsing preserves boundary membership for these second-aligned windows. Within each source segment all passages are retained verbatim.
- Official mining rounds are 600 seconds from the active deployment's genesis. Do not substitute the published graph's genesis into a different API graph.
- Core frontier `settledThroughRound` is certified only for the verified graph. Future rounds are unknown, never zero. A zero-work batch may advance the frontier without any active-round event.
- Raw run coverage and eligibility are independent of chain certification. Historical runs are available from the API's `coverageStartAt`, not all time. Observed first snapshot: 2026-10-26T21:16:49.503258Z. No retention guarantee found.
- Run pages can be empty while carrying a cursor; preserve it. Continue from it in future polls. A nonempty last page alone is not proof that ingestion reached the head.
- Coverage must extend through a completed game interval. Non-hardware provenance, ineligible segments, overlapping passage timestamps and discontinuities inside the interval make it unscorable.

## Prediction window decision

There is no verified API endpoint promising a lockable next mining-round prediction window or per-round final hardware evidence for this game. Instead, game rounds are future UTC-aligned two-minute intervals. Lock is the start, at least 30 seconds after server creation. Outcomes count exact eligible passages in `[start, end)`. The server waits two minutes after end and for full hardware coverage. This is an original game rule, not a Squeekchain protocol round.

Calibration freezes zero as a distinct class and uses the median positive count from up to 240 prior complete two-minute windows. At least 12 total and three positive windows are required. This avoids three identical zero quantiles during long naps.

## Rate limits and caching

Per-IP official limits: `publicFast` 30/s burst 60; `publicHeavy` 5/s burst 20; `metadata` 20/s burst 40; observations (`runs`, `blocks`) 2/s burst 4. Respect `Retry-After` on 429/503. HTTP 200 with `status=unavailable` is a valid unknown outcome, not zero.

Official shared cache: status 1s; core/events/settlements without range 5s; stats and ranged settlements 60s; runs/blocks no-store. Conditional endpoints use ETag/304. `generatedAt` may stay unchanged on an unchanged response. Chain freshness follows `safeThroughBlock`, not generated time. The app polls telemetry every 15s, caches it server-side for 5s, deduplicates in-flight fetches and ingests at most six run pages per sync, 550ms apart. Global DB sync cooldown is 10s.

## Finality, corrections and unknowns

Official chain reads lag the tip by 12 confirmations, which protects against short reorgs but is not absolute finality. Event projections should key `(chainId, blockHash, txHash, logIndex)` and roll back/replay from a common ancestor. This MVP does not build a chain indexer because identity verification failed.

Raw run immutability and retention are not guaranteed by the docs. The app stores complete used segment payloads and hashes. If ingestion encounters an existing segment with different content or a changed installation, it persists a halt, marks prior settled game rounds disputed, and excludes those prediction awards from ranking until operator review. There is no automatic retroactive rescanning of all prior pages, so corrections outside the ingested cursor may remain undetected. Production operators must schedule periodic historical audits; see deployment guide.

Unresolved: independently verifying device signatures; identifying corrections outside the current cursor; formal API retention; a corrected deployment manifest; production load and PostgreSQL provider validation; IMD first-job owner/payment; Genesis review and badge eligibility. None is claimed complete.

## IMD and Genesis verification

[Genesis Code](https://squeekchain.com/genesis/code) states that a project belongs to its first job's paying wallet and only a wallet verified on the participant's profile may link it. The current source says direct submissions are paused, and describes Swarm Review as opening soon. The Buildooooor requires team approval; early badges remain subject to the current official rules.

[IMD docs](https://imd.fun/docs/) describe the explorer launch page, `job.open`, `job.continue`, quote → payment challenge → signed submit, and read-only capabilities/OpenAPI. Queried `GET https://api.imd.fun/requests/capabilities` and `/openapi.json`; `job.open` and `job.continue` are enabled. At retrieval, a single job's admission price was 0.5 IMD and a quote lasted 600 seconds. Recheck immediately before any authorized payment; no price is locked here. A paid request does not guarantee a result.

No IMD execution tool or authenticated worker is connected in this chat. Running Codex in this repository is not the IMD project/job workflow. No quote, job, payment, wallet signature, push, public deployment or Genesis submission was made.
