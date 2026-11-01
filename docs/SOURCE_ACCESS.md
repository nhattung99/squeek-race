# Official source access: Vercel HTTP 403

## Observed problem

The deployed app's PostgreSQL health check returned `ok`, while its server-side Squeekchain status request returned HTTP 403. At the same investigation, official `/v1/status` and `/v1/measurement/runs?limit=1` requests from the development network returned HTTP 200 and `Access-Control-Allow-Origin: *`. The exact upstream refusal policy is unknown. Do not claim an IP allowlist, new API permission or resolution without confirmation from the provider.

The official API reference explicitly permits unauthenticated public reads from servers and browsers with CORS. The browser path implemented here uses that documented interface, not a proxy, fabricated header identity or disabled authorization. Source: https://docs.squeekchain.com/developers/api/.

## What the app now does

- If trusted server telemetry is unavailable, read the fixed official `/v1/status` endpoint directly from the browser every 15 seconds, with no credentials, a ten-second timeout and schema/freshness/hardware-provenance checks.
- Clearly label these readings **display only**. They can move the unranked live wheel companion, but do not set race conditions, prediction outcomes, points or leaderboard scores.
- Retain the server-only race snapshot and standard regeneration when no trusted server telemetry is available. Grand Prix remains playable and its AI results remain server-authoritative.
- Back off each forbidden server endpoint for 60 seconds instead of retrying it on every UI poll. Show one persistent source-status notice rather than repeated 403 toasts.
- Award no prediction points from incomplete evidence. Never upload browser-reported measurements as verified outcomes.

This restores an allowed display path when the player's network can read the public API. It does **not** claim that Vercel server ingestion has recovered. If the browser is also denied, display stays unknown.

## Restore trusted prediction ingestion

Preferred: ask the Squeekchain API operator to confirm the supported server integration method and resolve the Vercel refusal. A second supported deployment choice is a trusted source worker running from a server/network where the official API permits reads. Do not rotate proxies or impersonate another client to evade restrictions.

The repository includes `npm run source:sync`, which calls the existing validated server ingestion/settlement pipeline. It requires the **same PostgreSQL database** as the deployed game, never the browser and never an anonymous player. The worker keeps opaque cursors, complete source records, uniqueness/idempotency, interval coverage checks and server-side outcome calculation unchanged.

For an owner-operated local trial:

1. On a trusted machine with Node.js 24, use this repository and run `npm ci`.
2. Privately configure the deployed game's pooled `DATABASE_URL` in `.env.local` (ignored by Git) or the worker's secret environment. Never post it in chat, commit it or put it in client code. The worker refuses the local PGlite fallback.
3. Run `npm run source:sync -- --watch` and leave that terminal running. Ctrl+C stops it after the current operation/wait. A single run without `--watch` processes one bounded batch only.
4. Allow initial history catch-up. Watch the safe summary's `caughtUp` and coverage timestamp, then verify future predictions and settlement on the deployed game.
5. If the worker stops, trusted coverage becomes stale and new predictions pause. For persistent service, move it to an authorized always-on server and review hosting costs first.

This worker has been prepared in code but has not been connected to the owner's production database or launched in this session. Vercel's existing scheduler can remain configured, but does not cure an upstream 403. Browser telemetry never replaces this trusted ingestion path. The Grand Prix wheel modifier still comes from its disclosed Vercel server snapshot, not browser telemetry or this history-only worker.

## Message the owner can send to the API operator

> We are integrating the documented public read API in SqueekRace Arena: https://squeek-race.vercel.app/ (source: https://github.com/nhattung99/squeek-race). Requests from our Vercel Node.js backend receive HTTP 403, while public browser/development-network reads return HTTP 200 with CORS enabled. Can you confirm the supported backend access method and help diagnose the refusal? We can provide timestamps and request IDs privately. We will not use proxies to bypass restrictions.

No message has been sent on the owner's behalf. IMD attribution, public source availability and Genesis approval remain separate review requirements; this change guarantees none of them.
