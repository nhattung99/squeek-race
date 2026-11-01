# Deployment guide

Source publication to https://github.com/nhattung99/squeek-race is authorized by the owner. No public deployment, paid service or cloud database has been created by this agent. The repository is prepared for Next.js on Vercel with external PostgreSQL.

## Vercel dashboard quickstart

1. Import `nhattung99/squeek-race` from GitHub, branch `main`, root directory `./`, framework **Next.js**. Keep the repository's `npm run build` command and automatic output detection; do not set a static export or IPFS output.
2. Use Node.js **24.x** (also pinned in `package.json`).
3. Connect a PostgreSQL provider through Vercel Marketplace, such as Neon or Supabase, after reviewing its current plan and costs. Configure its pooled connection string as server-only `DATABASE_URL`. Do not use the local `.data` database on Vercel.
4. Set `APP_ORIGIN` to the actual canonical deployment origin, e.g. `https://YOUR-ACTUAL-DOMAIN.vercel.app`, without a trailing slash. It must not be localhost. If the URL is assigned only after the first deploy, set this variable once known and redeploy before testing profiles or races.
5. Set a random `CRON_SECRET` of at least 32 characters and initially `TRUST_PROXY=false`. Never prefix database credentials or scheduler secrets with `NEXT_PUBLIC_`. The current configuration does not activate a paid scheduler.
6. Deploy, then test creating a racer, starting a Grand Prix, finishing, and reloading to confirm the result persists. Check Function logs for database failures without sharing secret values. Cloud PostgreSQL and Vercel execution still require this real deployment acceptance test.

References: https://vercel.com/docs/marketplace-storage, https://vercel.com/docs/environment-variables, https://vercel.com/docs/functions/runtimes/node-js/node-js-versions.

## Local development

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000`. Default development accepts same-origin browser requests using the Host header. If you set `APP_ORIGIN`, it must match exactly, including scheme and port. `.env.example` uses 127.0.0.1. A profile created under localhost is a different browser cookie scope from 127.0.0.1.

Persistent local PostgreSQL lives at `.data/postgres`. Do not run a second process against the same PGlite directory. The integration suite uses separate randomly named test directories. Back up a stopped local database directory rather than copying a live database during writes.

Local development uses `.next`; local production builds use `.next-production`, allowing QA to run without output-directory collisions. On Vercel (`VERCEL` is set), every phase uses `.next` regardless of `NODE_ENV`, matching the hosting adapter's expected output. Keep Vercel's Output Directory at the default `.next`; do not override it to `.next-production`. Production uses `next build --webpack`, avoiding a reproducible Turbopack CSS worker failure on this Windows host.

## PostgreSQL and Vercel

After authorization, provision a PostgreSQL database with backups. Set a pooled `DATABASE_URL`, require provider-recommended TLS, and restrict network access. The app uses postgres.js via Drizzle with at most three connections per worker and prepared statements off for pooler compatibility. No provider account or credentials are bundled.

Set these environment variables:

| Variable | Requirement |
|---|---|
| `DATABASE_URL` | Required on Vercel. Pooled PostgreSQL connection URL; never client-visible. |
| `APP_ORIGIN` | Required for production mutations, exactly the canonical HTTPS URL. Preview deployments need their exact preview origin. |
| `CRON_SECRET` | Random secret of at least 32 characters; used by authenticated ingestion GET. |
| `TRUST_PROXY` | Keep false unless a trusted ingress overwrites `X-Forwarded-For`; then true. |

The app initializes idempotent schema DDL on startup. For a controlled production rollout, run those statements with migration credentials first, then grant runtime access only to the needed schema/tables. A minimal shared guard table serializes transactions. Test provider-specific transaction/locking semantics in staging before launch. Production cloud PostgreSQL was not available in this task; local tests exercise real PostgreSQL via PGlite, not a mock SQL engine.

Build and start:

```sh
npm run lint
npx tsc --noEmit
npm run test
npm run build
npm start
```

`vercel.json` selects Next.js, the build command, and a 60-second sync handler budget. It deliberately does not activate cron or publish anything. Vercel's allowed schedules and execution quotas depend on the chosen plan; confirm costs with the owner before enabling paid capabilities.

## Scheduling

Configure an authorized scheduler to call `GET /api/sync` every minute with `Authorization: Bearer <CRON_SECRET>`. A server can also call the same handler every 15–30 seconds. Do not expose the secret in command-line URLs or public logs. Browser visits also call same-origin `POST /api/sync`, but relying on visits alone postpones settlement while no one is online.

A minute schedule can take longer to catch up the initial history than active browser polling. Rankings stay closed while unsynchronized. Allow catch-up before the launch announcement. No background activity is started by this repository's configuration alone.

## Production acceptance

1. Confirm the actual official source, schema versions and hardware provenance again. The deployment mismatch blocks chain-certified claims, not the explicitly described measurement game.
2. Test production PostgreSQL, concurrent lock attempts, exact-origin enforcement and Secure/HttpOnly/SameSite cookie behavior over HTTPS.
3. Configure ingress read/write limits and a body size cap. Per-app write limits exist, but a trusted ingress is needed for reliable IP limits and broad read abuse protection.
4. Install the scheduler with the owner's approval. Monitor feed age, cursor advancement, halted state, pending-round age and API errors. Alert when a round is unresolved for more than ten minutes; never score missing data as zero.
5. Back up segments, rounds, predictions, awards, players and audit together. Verify a restore and replay a settled round from original payloads.
6. Add a periodic full historical hash audit, because incremental cursor ingestion does not discover every retroactive upstream correction. On a mismatch, persist a halt, dispute affected rounds, investigate provenance, and replay any dependent streak awards in chronological order after review. Preserve original evidence.
7. Establish retention and account deletion/export operations. This MVP retains server evidence indefinitely; absolute anonymous session access expires after 90 days. Do not attach money or prizes to anonymous identities.
8. Load-test transaction serialization and API costs. Scale ingestion with a pre-fetch database lease and projections with indexed read models when needed.
9. Review the included MIT license for original code/art, publish only intended files, check for secrets and proprietary downloaded documentation, then request approval before GitHub push or public deployment.

## Recovery

Unavailability: wait and retry at the documented cadence; existing predictions stay pending. Invalid cursor: inspect the upstream error, installation and retained coverage before an audited reset. Installation drift or changed segment: `feed.halted` persists and all settled prediction rounds become disputed; points are excluded without deleting awards. Clearing the halt is an operator database procedure, not an unauthenticated API action. Take a backup, verify a complete replacement evidence set, recompute affected outcomes/streaks in order, record the repair in `audit`, and only then resume. A permanent incomplete round must be resolved explicitly; it blocks later chronological settlement.
