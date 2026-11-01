# Game rules — passages-v1

All points are free, off-chain, non-transferable game points with no redemption value. They are not SQK, protocol rewards, airdrop allocations or wagers.

## Future predictions

The server creates a round starting at the first UTC two-minute boundary at least 30 seconds in the future. Start is also lock time. The interval is `[start, start + 120 seconds)`.

Ranges freeze at creation from up to 240 preceding complete, eligible, two-minute hardware windows, ending at least two minutes in the past. Require 12 total windows and three positive windows. Sort positive counts ascending and take the lower median.

| Choice | Count |
|---|---|
| Cozy paws | Exactly 0 accepted passages |
| Cruise control | 1 through the frozen median inclusive |
| Full squeek | Greater than the frozen median |

Server time is authoritative. Requests arriving at or after lock are rejected even if the browser countdown disagrees. One prediction per server profile per round, enforced by a database unique constraint. Submitted predictions are immutable through the application.

After end + 120 seconds, settlement requires matching installation, evidence covering the full interval, hardware provenance, eligible segments, no discontinuity whose start is inside the interval, and no duplicate timestamp. Source absence, stale feed, invalid cursor, schema errors, gaps or incomplete evidence do not become zeros. Previously locked predictions can settle later if complete retained evidence arrives; new submissions require a fresh caught-up feed.

Correct: 100 points. Incorrect: zero and reset streak. Every third consecutive correct prediction: extra 50 points (wins 3, 6, 9…). Only eligible scored prediction awards affect streak. Daily awards do not affect it. Awards are unique by prediction ID and generated inside the serialized settlement transaction. Rounds settle in time order; an unresolved earlier interval blocks later settlement to protect streak ordering. An operator must investigate a permanently unresolved interval rather than silently skip it.

## Sprint

At Start, capture the hardware counter and counter epoch. Progress is `min(100, max(0, (current - captured) * 100 / 60))`. It advances only on new fresh accepted hardware data. Animation interpolates between those observed counter values for presentation. There are no independent real-world racers, positions or fabricated opponents. Repeated starts are harmless and yield no leaderboard points. A changed epoch requires restart. Zero hardware work means no progress.

## Daily challenge

The server freezes an eligible completed hardware window and ranges when a player's UTC-day challenge is first opened. The UTC date hashes to an index in the then-available positive historical windows. Available history can differ between players opening at different times; no claim of an identical competitive puzzle is made.

The player classifies the window, then sees its accepted count and correct range. Award 25 participation points exactly once per player per UTC day, regardless of correctness. Historical public outcomes cannot safely prove prediction skill, so daily answers never increment ranked accuracy or streak. Future midnight creates a new day; an old dialog cannot award an old day again.

## Community ranking

Order: game points descending, prediction accuracy descending, settled prediction participation descending, stable player ID ascending. Include only server awards. Disputed round awards remain in the audit ledger but are excluded from displayed ranking and profile statistics. Anonymous registration and submission limits are not full Sybil resistance. No prizes or money depend on this ranking.

## Replay and audit

For your predictions, History → Details loads any retained round, its frozen thresholds, outcome, award and evidence. Settled replays bucket actual retained passage timestamps into 24 five-second bins and show them in six seconds. The visual replay has no authority over score calculation.
