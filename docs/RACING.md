# Squeek Grand Prix — server-authoritative AI matches

The main playable race is at `/#play` and `/arena`: a human racer against **two explicitly labeled simulated AI opponents**, Violet Volt and Cyan Comet. It is not human multiplayer and does not claim actual hamsters compete in physical races.

## Play

Create a server profile, press **Start race**, wait for the three-second server countdown, then use Left/Right or A/D to change lanes and Space to boost. Touch buttons provide the same inputs. The race is 1,000 **virtual game metres**, not physical measured wheel distance. Avoid crates: each collision cancels boost and slows the racer for 1.5 seconds. Energy pickups restore 20%; boost costs 35% and lasts two seconds. There is no client-written score or finish time.

Three competitor progress lanes remain visible above the interactive road. Live positions are provisional; the server confirms the final classification once all three racers finish. The result includes all times, collisions, a match ID and a retained receipt digest. Reloading restores the latest server match, including its completed result. A disconnected racer continues using the last accepted lane; refreshing later advances the deterministic simulation to server time. No browser tab must stay open for simulated time to exist.

## Authority and persistence

`src/lib/race-engine.ts` implements deterministic, seeded, 50ms fixed ticks using integer milli game metres. All authority is in `src/lib/races.ts` and `/api/races`. The browser sends only `start`, `left`, `right` and `boost`, an owned match ID and sequence number. Strict schemas reject client rank, distance, finish-time and score fields. The server records the control at the next tick after receipt; clients cannot backdate it.

One active match per player is enforced by a database partial unique index and the shared serialized transaction guard. A start retry returns the active match. Input retries do not apply the same control twice; new commands require the next sequence, a minimum three-tick spacing, and a valid phase. Per-profile rate limits apply. A short client queue preserves fast left/boost combinations instead of silently discarding them. Unknown sessions, other players' match IDs, early commands, forged result fields and sequence jumps are rejected.

Tables `race_matches` and `race_results` are initialized idempotently on the existing PostgreSQL connection. `race_matches.snapshot` retains the seed, frozen wheel context, ordered control log and current simulated state. `race_results` has one immutable receipt per match: player, rank, finish milliseconds, collisions, full three-racer classification, rule version, seed and timestamped-by-tick inputs. The receipt digest uses recursively key-sorted canonical JSON and SHA-256, allowing verification after JSONB key reordering. Completed reads return the stored receipt, never reroll the outcome.

Rank is sorted by actual simulated finish time, then stable racer ID for ties. Fractional finish time within the final server tick is calculated deterministically. Live race order sorts unfinished racers by distance. The race board lists recorded human match performances ordered by rank, finish time, completion timestamp and match ID. Courses vary by random server seed, so this board is not a claim of identical-course esports competition. Race achievements are completely separate from prediction accuracy, streaks and the prediction award ledger. No transferable or financial reward is attached.

## Real wheel influence

At creation, the server reads the existing validated official `/status` client and freezes the hardware observation time, installation, `rpmMilli`, freshness/availability and active/resting state. Fresh active hardware gives every racer 7% energy regeneration per second; fresh resting hardware gives 5%. This original game modifier does not assert a protocol reward or measured racing distance.

When the API is unavailable, the race still runs with a clearly labeled standard 5% regeneration and a frozen unavailable context. No fictional observation is inserted. A mid-race API change does not alter frozen conditions. The original API/published-deployment mismatch remains relevant to chain-certified claims: these races are server simulations, not Ethereum settlements or SqueekCore-certified competition.

## Validation and limits

Tests cover seeded reproducibility, tick ordering, lane bounds, boost cost, collision crossings, AI finish and sorting, sequence/idempotency, rate spacing, countdown, session ownership, persistent results, exact receipt replay after database round-trip, unchanged prediction points and starting a fresh match. Real-time Playwright exercises a whole match, steering, boost, mobile layout, forged-result rejection and restored final standings after reload.

Anonymous accounts remain susceptible to Sybil creation and automated play; do not offer money or prizes. The global database guard prioritizes correctness over scale. Production multiplayer, cloud PostgreSQL load testing, matchmaking, lag compensation and signed third-party attestations are not implemented. A SHA-256 receipt identifies stored server output; it is not an independent signature or a badge approval.

Legacy offline Arcade Sprint remains collapsed as optional practice; Live Wheel Companion remains a separate collapsed telemetry view. Neither is presented as the main race.
