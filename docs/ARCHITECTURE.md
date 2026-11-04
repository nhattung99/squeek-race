# Architecture

## Trust boundary

```text
Official public API
  → validated Zod responses / timeout / ETag / Retry-After
  → cursor ingestion → immutable segment payload + SHA-256
  → server coverage checks → frozen future round
Browser choice + HttpOnly session
  → same-origin POST → rate limit → database guard transaction
  → immutable prediction (player, round unique)
  → time-ordered settlement → deterministic points ledger
  → leaderboard/profile projection + source replay
```

Client rendering uses Next.js App Router, strict TypeScript, Tailwind, shadcn-style Radix/CVA Button, Motion and Lucide. Original SVG hamsters and CSS circuit require no remote assets. Client code imports only server types, never database runtime modules. Client clocks are for display only.

## Persistence

Drizzle ORM executes parameterized PostgreSQL queries. Development uses persistent PGlite (actual PostgreSQL via WASM) at `.data/postgres`; production uses pooled PostgreSQL over `DATABASE_URL`. Vercel refuses the local fallback. Schema creation is idempotent; all initialization statements live in `src/lib/db.ts`. Production database permissions must be limited to this application's schema. Separate privileged migration credentials from runtime credentials when formalizing deployment.

Tables: `players`, `limits`, `feed`, `segments`, `rounds`, `predictions`, `awards`, `daily`, `audit`, `arena_guard`. Player tokens are random 256-bit values; only SHA-256 token hashes are stored. Points are a projection of the awards ledger, not a writable player property.

Every mutation requiring fairness locks the one `arena_guard` row with `FOR UPDATE` inside a transaction. This deliberately favors correctness over throughput in the MVP: round creation, submissions, limits, daily awards and settlement serialize across PostgreSQL-backed workers. Source network requests happen outside that transaction, with a cursor compare inside it. Concurrency advances either commit once or retry later. Single-server PGlite is not a shared multi-process database.

## HTTP interface

| Route | Authority |
|---|---|
| `GET /api/state` | Private no-store public feed + current profile/history projection |
| `POST /api/profile` | Validated nickname/avatar, Origin check, registration rate limit; secure production cookie |
| `POST /api/predict` | Session, Origin, strict body schema, per-player rate limit, server clock and unique prediction |
| `POST /api/sync` | Origin and IP rate limit; only reads fixed official API and advances deterministic server engine |
| `GET /api/sync` | Requires `Authorization: Bearer CRON_SECRET`; scheduler entrypoint |
| `GET/POST /api/daily` | Session; POST also Origin, schema and per-player rate limit |
| `GET /api/round?id=…` | Session and ownership of a prediction; full retained detail/replay |

## Freshness and authority

No browser-local persistence is used for scores. Live status must have hardware provenance, an online accepted measurement, valid bounded timestamps and no counter fault. Ingested runs are not Core-certified. Historical scoring requires complete recorded hardware evidence and preserves its API source; it does not claim independently verified P-256 signatures.

Invalid/missing data leaves predictions pending. Detected correction or installation drift persists a halt and audit event; affected ranked awards are excluded without deleting them. Historical corrections outside the cursor require a separate operator audit. No chain reorg indexer is implemented; the published/live identity mismatch means chain-certified gameplay stays disabled.

## Security and operations limitations

Strict request bodies reject client-supplied score fields. Cookies are HttpOnly, SameSite Strict and Secure in production, expiring after 90 days; profile lookup enforces absolute expiry. Production accepts the configured canonical `APP_ORIGIN` and exact project domains from trusted Vercel system environment variables. It never trusts arbitrary caller Host headers or wildcard Vercel tenants. Mutating routes reject missing/mismatched origins. Body size is checked before JSON parsing after read and by Content-Length; the hosting proxy should also enforce a hard transport body limit.

Trusted forwarded IP handling is off by default. Enable only behind a proxy that overwrites that header; otherwise all registrations share conservative local limits. Token secrecy is the anonymous authentication mechanism. Optional victory recording adds a per-match nonce/expiry wallet signature; it does not replace profile authentication. No player private keys or seed phrases are requested. Cookie theft and Sybil accounts remain risks; do not attach financial rewards.

Optional custom Sepolia receipts use `win_claims`, an isolated read-only database attestor service, EIP-712 vouchers and the immutable `SqueekRaceWins` contract. The game process holds no signing key. The contract trusts the attestor's game judgment, enforces the caller and one record per match, and stores the server receipt digest. No SQK contract is called. It remains disabled until an owner-approved deployment, pinned bytecode and signer configuration. See `ONCHAIN_WINS.md` for the protocol, recovery and limits.

Read endpoints currently have no application-level read rate limit; use platform/WAF limits before public exposure. Global transaction serialization and retained raw evidence grow over time, so load testing, retention/backups and database monitoring are required before scale. HTTP error responses expose allowlisted messages and do not return raw database errors. No production PostgreSQL instance or deployment was provisioned in this task.
