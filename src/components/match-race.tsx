"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  LockKeyhole,
  ShieldCheck,
  Trophy,
  Zap,
} from "lucide-react";
import type { MatchView } from "@/lib/races";
import { raceCourse, RACE_LENGTH, type RaceAction } from "@/lib/race-engine";
import { Hamster } from "./hamster";
import { Button } from "./ui/button";
type BoardEntry = {
  match_id: string;
  nickname: string;
  rank: number;
  finish_ms: number;
  hits: number;
  digest: string;
};
type ResponseData = { match: MatchView | null; leaderboard: BoardEntry[] };
async function call(body?: unknown, id?: string): Promise<ResponseData> {
  const response = await fetch(
    `/api/races${id ? `?id=${encodeURIComponent(id)}` : ""}`,
    {
      cache: "no-store",
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Could not connect to the race server");
  return data;
}
export function MatchRace({
  player,
  onJoin,
}: {
  player: { id: string; nickname: string; avatar: number } | null;
  onJoin: () => void;
}) {
  const [match, setMatch] = useState<MatchView | null>(null);
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState(3);
  const current = useRef<MatchView | null>(null);
  const actionQueue = useRef<Promise<void>>(Promise.resolve());
  const queuedInputs = useRef(0);
  const lastInput = useRef(0);
  const track = useRef<HTMLElement>(null);
  const generation = useRef(0);
  const accept = useCallback((data: ResponseData) => {
    const next = data.match;
    const old = current.current;
    if (!next) {
      current.current = null;
      setMatch(null);
    }
    if (
      next &&
      (!old ||
        old.id !== next.id ||
        next.tick > old.tick ||
        (next.tick === old.tick && next.sequence >= old.sequence))
    ) {
      current.current = next;
      setMatch(next);
      setCount(Math.max(0, Math.ceil((next.startsAt - next.serverNow) / 1000)));
    }
    setBoard(data.leaderboard);
  }, []);
  useEffect(() => {
    let live = true;
    const epoch = ++generation.current;
    const initial = setTimeout(() => {
      void call()
        .then((data) => {
          if (live && generation.current === epoch) accept(data);
        })
        .catch(() => {
          if (live)
            setError(
              "Race server unavailable. Retry the connection before starting.",
            );
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(initial);
      current.current = null;
    };
  }, [accept, player?.id]);
  const matchId = match?.id;
  const matchStatus = match?.status;
  useEffect(() => {
    if (!matchId || matchStatus === "finished") return;
    let active = true;
    let pending = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void call(undefined, matchId)
        .then((data) => {
          if (active) {
            accept(data);
            setError("");
          }
        })
        .catch(() => {
          if (active)
            setError(
              "Connection interrupted. Your match is saved on the server. Reconnecting…",
            );
        })
        .finally(() => {
          pending = false;
        });
    }, 250);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [matchId, matchStatus, accept]);
  async function start() {
    if (!player) {
      onJoin();
      return;
    }
    setBusy(true);
    setError("");
    const epoch = ++generation.current;
    try {
      const data = await call({ kind: "start" });
      if (generation.current === epoch) accept(data);
      track.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the match");
    } finally {
      setBusy(false);
    }
  }
  const control = useCallback(
    (action: RaceAction) => {
      const intendedId = current.current?.id;
      if (!intendedId || queuedInputs.current >= 4) return;
      queuedInputs.current++;
      const send = async () => {
        const delay = Math.max(0, 200 - (Date.now() - lastInput.current));
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const value = current.current;
        if (
          !value ||
          value.id !== intendedId ||
          value.status !== "racing" ||
          value.riders.find((r) => !r.ai)?.finishMs !== null
        )
          return;
        lastInput.current = Date.now();
        try {
          accept(
            await call({
              kind: "control",
              id: value.id,
              action,
              sequence: value.sequence + 1,
            }),
          );
          setError("");
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not send the control input",
          );
          try {
            accept(await call(undefined, value.id));
          } catch {
            /* Keep confirmed state. */
          }
        }
      };
      actionQueue.current = actionQueue.current.then(send, send).finally(() => {
        queuedInputs.current--;
      });
      return actionQueue.current;
    },
    [accept],
  );
  const human = match?.riders.find((r) => !r.ai);
  const racing = match?.status === "racing" && human?.finishMs === null;
  const course = match ? raceCourse(match.seed) : [];
  const humanDistance = human?.distance ?? 0;
  const actors = match?.riders ?? [
    {
      id: "player",
      name: player?.nickname ?? "You",
      ai: false,
      avatar: player?.avatar ?? 0,
      lane: 1,
      distance: 0,
      finishMs: null,
      rank: 1,
      energy: 10000,
      boost: 0,
      hits: 0,
    },
  ];
  return (
    <section
      id="play"
      className="panel match-panel"
      tabIndex={0}
      ref={track}
      aria-label="Server race match"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (
          ["ArrowLeft", "a", "A", "ArrowRight", "d", "D", " "].includes(e.key)
        ) {
          e.preventDefault();
          if (e.repeat) return;
          void control(
            e.key === " "
              ? "boost"
              : ["ArrowLeft", "a", "A"].includes(e.key)
                ? "left"
                : "right",
          );
        }
      }}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">MAIN RACE · SERVER-VERIFIED RESULTS</span>
          <h2>
            Squeek Grand Prix <Flag size={20} />
          </h2>
        </div>
        <span className="pill cyan">
          <ShieldCheck size={12} />
          SERVER
        </span>
      </div>
      <p className="practice-description">
        Race against <strong>2 AI opponents</strong>. Change lanes, dodge
        crates, collect energy, and boost your way to first place!
      </p>
      <div className="match-source">
        <Zap size={13} />
        {match?.wheel.available
          ? `Wheel energy at the start: ${match.wheel.active ? "active · regenerating 7%/second" : "resting · regenerating 5%/second"}`
          : "Simulated track · standard energy until verified wheel data is available"}
      </div>
      <div className="match-hud">
        <span>
          PLACE <strong data-testid="match-rank">{human?.rank ?? "—"}/3</strong>
        </span>
        <span>
          <Zap size={15} />
          {Math.floor((human?.energy ?? 10000) / 100)}%
        </span>
        <span data-testid="match-distance" data-distance={humanDistance}>
          {Math.floor(humanDistance / 1000)} / 1000 virtual m
        </span>
        <span>{((match?.tick ?? 0) * 0.05).toFixed(1)}s</span>
      </div>
      <div className="match-grid-order" aria-label="Live race standings">
        {actors.map((r) => (
          <div key={r.id} className={!r.ai ? "your-position" : ""}>
            <span>
              {r.rank}. {r.ai ? `${r.name} · AI` : "YOU"}
            </span>
            <div className="match-progress-rail">
              <span style={{ width: `${(r.distance / RACE_LENGTH) * 100}%` }} />
              <i
                style={{
                  left: `${Math.min(94, (r.distance / RACE_LENGTH) * 94)}%`,
                }}
              >
                <Hamster
                  color={["orange", "violet", "cyan", "pink"][r.avatar]}
                />
              </i>
            </div>
            <small>
              {r.finishMs !== null
                ? `${(r.finishMs / 1000).toFixed(2)}s ✓`
                : `${Math.floor(r.distance / 1000)} m`}
            </small>
          </div>
        ))}
      </div>
      <div
        className={`practice-road match-road ${human?.boost ? "boosting" : ""}`}
      >
        <div
          className="practice-lane-lines"
          style={{ backgroundPositionY: `${humanDistance / 200}px` }}
        />
        <div className="practice-running-status">
          {racing ? "RACING · ← → STEER · SPACE TO BOOST" : "SQUEEK GRAND PRIX"}
        </div>
        {racing &&
          course
            .filter(
              (item) =>
                item.at >= humanDistance && item.at - humanDistance < 170000,
            )
            .map((item) => (
              <div
                key={item.id}
                className={`practice-item ${item.kind}`}
                style={{
                  left: `${((item.lane + 0.5) * 100) / 3}%`,
                  top: `${77 - ((item.at - humanDistance) / 170000) * 80}%`,
                }}
              >
                {item.kind === "energy" ? <Zap size={24} /> : "▧"}
              </div>
            ))}
        {actors
          .filter((r) => !r.ai || Math.abs(r.distance - humanDistance) < 110000)
          .map((r) => (
            <div
              key={r.id}
              className={`match-racer ${r.ai ? "opponent" : "human"}`}
              style={{
                left: `${((r.lane + 0.5) * 100) / 3}%`,
                bottom: r.ai
                  ? `${Math.max(8, Math.min(78, 8 + ((r.distance - humanDistance) / 170000) * 80))}%`
                  : "6%",
                transform: `translateX(-50%) translateY(${racing ? Math.sin((match?.tick ?? 0) * 0.65 + (r.ai ? 1 : 0)) * 3 : 0}px)`,
              }}
            >
              <span>{r.ai ? `${r.name} · AI` : "YOU"}</span>
              <Hamster color={["orange", "violet", "cyan", "pink"][r.avatar]} />
            </div>
          ))}
        {(!match ||
          match.status === "countdown" ||
          match.status === "finished" ||
          (human?.finishMs !== null && human?.finishMs !== undefined)) && (
          <div className="practice-overlay" role="status">
            {!match ? (
              <>
                <strong>Race against 2 AI opponents</strong>
                <span>Start → steer → finish → server-confirmed standings</span>
                <Button onClick={start} disabled={busy}>
                  <Flag size={17} />
                  {busy
                    ? "Creating match…"
                    : player
                      ? "Start race"
                      : "Create a racer to compete"}
                </Button>
              </>
            ) : match.status === "countdown" ? (
              <>
                <strong className="practice-countdown">{count || "GO!"}</strong>
                <span>Match created on the server · get ready to race!</span>
              </>
            ) : match.status === "finished" ? (
              <>
                <Trophy size={30} />
                <strong>FINISHED · PLACE {human?.rank}/3</strong>
                <span>
                  <ShieldCheck size={14} /> Result confirmed and saved by the
                  server
                </span>
                <Button onClick={start} disabled={busy}>
                  Race again
                </Button>
              </>
            ) : (
              <>
                <strong>You crossed the finish line!</strong>
                <span>Waiting for the AI racers to finish…</span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="practice-controls">
        <Button
          variant="outline"
          aria-label="Steer left"
          onClick={() => void control("left")}
          disabled={!racing}
        >
          <ArrowLeft size={22} />
        </Button>
        <Button
          onClick={() => void control("boost")}
          disabled={!racing || (human?.energy ?? 0) < 3500 || !!human?.boost}
        >
          <Zap size={18} />
          Boost · 35%
        </Button>
        <Button
          variant="outline"
          aria-label="Steer right"
          onClick={() => void control("right")}
          disabled={!racing}
        >
          <ArrowRight size={22} />
        </Button>
      </div>
      {error && (
        <div className="match-error" role="alert">
          {error}
          <button
            onClick={() =>
              void call(undefined, match?.id)
                .then((data) => {
                  accept(data);
                  setError("");
                })
                .catch(() =>
                  setError("Server unavailable. Please try again later."),
                )
            }
          >
            Retry connection
          </button>
        </div>
      )}
      {match?.status === "finished" && (
        <div className="match-result" data-testid="confirmed-race-result">
          <h3>
            <ShieldCheck size={18} /> Server-confirmed race results
          </h3>
          {match.riders.map((r) => (
            <div key={r.id}>
              <strong>
                #{r.rank} {r.name} {r.ai ? "(AI)" : "(You)"}
              </strong>
              <span>
                {r.finishMs !== null ? (r.finishMs / 1000).toFixed(3) : "—"}s ·{" "}
                {r.hits} collisions
              </span>
            </div>
          ))}
          <details>
            <summary>
              <LockKeyhole size={12} /> Result receipt & reproducible rules
            </summary>
            <p>
              Match: {match.id}
              <br />
              Rules: {match.version}
              <br />
              SHA-256: {match.resultDigest}
            </p>
          </details>
        </div>
      )}
      <div className="match-board">
        <h3>
          <Trophy size={17} /> Race leaderboard · server records
        </h3>
        {board.length ? (
          board.slice(0, 5).map((entry, index) => (
            <div key={entry.match_id}>
              <span>
                {index + 1}. {entry.nickname}
              </span>
              <strong>
                Place {entry.rank}/3 · {(entry.finish_ms / 1000).toFixed(2)}s
              </strong>
            </div>
          ))
        ) : (
          <p>Finish your first race to record a result.</p>
        )}
      </div>
      <p className="fine-print">
        Opponents are simulated AI, not human multiplayer. The server processes
        controls and calculates distance, collisions, finish times, and
        standings. Race results are separate from verified prediction points. No
        wagering, cash, or token rewards.
      </p>
    </section>
  );
}
