# Demo script

Start the development server and open `http://127.0.0.1:3000`. Wait for the first hardware-history catch-up; it can take several minutes. Production scheduling should finish this before announcing the game.

1. **Original arcade arena:** show the hamster art, circuit and responsive layout. Explain that there is one real wheel, not a field of independently measured hamster competitors.
2. **Join:** choose a nickname/avatar. No wallet or keys are requested. The server creates an anonymous cookie-backed profile.
3. **Live sprint:** start a race to 60 new accepted passages. If Squeektoshi is resting, explain that the racer honestly stays still. Do not simulate live progress for the demo.
4. **Future prediction:** choose one of the frozen ranges, show the scheduled interval/lock countdown, and lock. A second choice is rejected. The source interval has not started yet.
5. **Waiting:** allow two minutes of measurement and two minutes of ingestion delay after start. A recording may cut this wait only if disclosed. Do not change clocks or substitute fixtures.
6. **Result:** History shows outcome and server points. Details opens source references and a replay of actual stored passage timestamps. The result may be a win or loss; do not fabricate a win.
7. **Daily challenge:** classify a completed historical interval. Reveal its count and receive 25 participation points, regardless of correctness. Explain why this does not boost prediction accuracy.
8. **Leaderboard/profile:** show server totals, accuracy and streak. Anonymous limitations and non-transferable points are clearly stated.
9. **Trust and attribution:** show About. Explain the observed live API/published deployment mismatch, measurement-vs-chain proof boundary, Codex development status and pending IMD/Genesis review.

Desktop/mobile images are in `docs/screenshots`. Actual API snapshots are under `docs/sources`. Test-only synthetic data is isolated to random `.data/tests-*` databases and is never a demo live feed. No public demo URL exists until the owner approves hosting.
