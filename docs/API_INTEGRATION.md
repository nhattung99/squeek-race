# API integration

All upstream requests go to the fixed [official API](https://api.squeekchain.com/v1), from server code. There is no arbitrary URL proxy or user-supplied upstream host.

## Operational reads

`src/lib/squeekchain.ts` validates status and runs with Zod and returns inferred TypeScript types. It rejects unrecognized schema versions, malformed integers, incomplete passage arrays, HTTP failures and HTTP-200 unavailable bodies. Extra fields are ignored to permit nonbreaking additions. Status freshness independently checks receipt and observation age, hardware provenance, counter state and the endpoint's freshness marker. A stale response never appears as zero activity.

`apiGet` uses a 10-second timeout, in-flight deduplication, server memory cache for cacheable reads and conditional ETag requests. A 304 reuses the validated prior response. Rate/capacity failures honor bounded `Retry-After` and pause requests rather than blocking a handler in long retries; subsequent browser/scheduler polls provide backoff. Memory caches are per worker, not a distributed cache.

## Cursor ingestion

`syncFeed` uses `limit=100` and persists the opaque cursor. Each invocation reads at most six pages and waits 550ms between observation requests (under two per second for one worker). It stores original segment payloads and their SHA-256 hashes, rejecting altered existing IDs. A transaction compares the cursor before committing, protecting against concurrent sync invocations.

Nonempty pages advance only coverage through their actual last segment. An empty tail page is required before adopting global `coverageThroughAt` as the caught-up watermark. Its next cursor, including one on an empty page, is retained for future polling. The server requires fresh coverage before opening/submitting predictions. A 400 invalid cursor is reported as an error; cursor resets require operator investigation so previously unseen evidence is not silently discarded.

Six pages per invocation and a database 10-second cooldown bound ordinary traffic. Several deployment workers can still race on a read before the cursor compare. Use one scheduled ingestion worker plus WAF limits; at larger scale add a database lease before fetching, not just the commit check.

## Outcome sources

Game windows use exact accepted eligible hardware passage timestamps in `[start,end)`, not a cumulative counter subtraction spanning counter epochs. Retained segment references and full payloads support reproduction. Source records explicitly say `authority=pi-device-key` and `certifiedCoreWork=false`. The server does not independently verify P-256 signatures. It trusts the official API's accepted evidence.

Settlement preserves source URL, installation, coverage watermark, retrieval time, ordered payload digest, segment IDs, rule version, work count and outcome. No fictional measurements, transactions, heights, SQK rewards or opponents are generated. A zero interval is meaningful only when global accepted evidence covers it and no invalid segment/discontinuity affects it.

## Other investigated endpoints

`src/lib/diagnostics.ts` provides typed diagnostic reads for blocks, statistics, Core, settlements and events. They are tested against real retrieved JSON. They do not enter scoring. Event pagination passes the same category and opaque cursor. Settlement history supports `range`, not pagination; its latest ten block-completing settlements cannot reconstruct all rounds. Statistics distinguish missing, partial, future and complete coverage.

The identity comparison intentionally fails for the saved live Core snapshot because its address differs from the official deployment manifest. No API-returned contract address is used in a transaction. Do not implement a chain-backed scoring mode until the official record and live deployment are reconciled and all code/config/governance identities are independently checked at a single confirmed block.

## Corrections

Changed content for an already ingested segment or a changed installation persists a halt/audit event and disputes prior prediction outcomes. Disputed awards remain stored but no longer count in projections. This protects detected problems, not undetected corrections to old pages. Reaudit cursor history periodically and compare hashes in a separate read-only job; halt before repairing if any difference is found. A safe corrective replay must recompute all subsequent streak bonuses in order, with an audit trail. There is no automatic admin endpoint that can arbitrarily alter scores.

No chain projection is used, so the app does not pretend to handle Ethereum reorgs by modifying device passage counts. Future chain features need the documented block-hash rollback/replay indexer and a stronger confirmation policy as appropriate.
