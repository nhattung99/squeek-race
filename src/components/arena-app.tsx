"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Flag,
  Flame,
  Gamepad2,
  Gauge,
  History,
  Info,
  LockKeyhole,
  Menu,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import { Hamster } from "./hamster";
import { RoundReplay } from "./round-replay";
import { PracticeRace } from "./practice-race";
import { MatchRace } from "./match-race";
import { useDirectWheel } from "./use-direct-wheel";
import { integer, milli } from "@/lib/utils";
import type { gameState } from "@/lib/game";
import type { Choice, Thresholds } from "@/lib/rules";

type State = Awaited<ReturnType<typeof gameState>>;
type Daily = {
  day: string;
  start: number;
  end: number;
  thresholds: Thresholds;
  completed: boolean;
  work?: string;
  outcome?: Choice;
  correct?: boolean;
};
const choices: {
  id: Choice;
  name: string;
  subtitle: string;
  icon: typeof Zap;
  color: string;
}[] = [
  {
    id: "cozy",
    name: "Cozy paws",
    subtitle: "A little wheel break",
    icon: Clock3,
    color: "cyan",
  },
  {
    id: "cruise",
    name: "Cruise control",
    subtitle: "Finding the rhythm",
    icon: Gauge,
    color: "violet",
  },
  {
    id: "zoom",
    name: "Full squeek",
    subtitle: "Tiny legs. Turbo energy.",
    icon: Zap,
    color: "orange",
  },
];
const nav = [
  { path: "", label: "Home", icon: Gamepad2 },
  { path: "arena", label: "Arena", icon: Flag },
  { path: "predict", label: "Predict", icon: Target },
  { path: "leaderboard", label: "Leaderboard", icon: Trophy },
  { path: "history", label: "History", icon: History },
];
function time(value: number | string) {
  return new Date(Number(value)).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    ...(body !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export function ArenaApp({ page }: { page: string }) {
  const [state, setState] = useState<State | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Choice | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [muted, setMuted] = useState(true);
  const [sprint, setSprint] = useState<{ epoch: string; start: string } | null>(
    null,
  );
  const [replay, setReplay] = useState<string | null>(null);
  const [syncDenied, setSyncDenied] = useState(false);
  const directWheel = useDirectWheel(!!state && !state.wheel?.fresh);
  const syncBusy = useRef(false);
  const clockOffset = useRef(0);
  const seenResults = useRef(new Map<string, boolean | null>());
  const refresh = useCallback(async () => {
    try {
      const data = await request<State>("/api/state");
      for (const result of data.predictions) {
        if (
          seenResults.current.has(result.id) &&
          seenResults.current.get(result.id) === null &&
          result.correct === true
        ) {
          setNotice(
            `Prediction won! +${result.points} points. Pawsome instincts!`,
          );
        }
        seenResults.current.set(result.id, result.correct);
      }
      clockOffset.current = data.serverNow - Date.now();
      setState(data);
      setNow(data.serverNow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection unavailable");
    }
  }, []);
  const sync = useCallback(async () => {
    if (syncBusy.current) return;
    syncBusy.current = true;
    try {
      await request("/api/sync", {});
      setSyncDenied(false);
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Feed unavailable";
      if (message.includes("Squeekchain HTTP 403")) setSyncDenied(true);
      else setError(message);
    } finally {
      syncBusy.current = false;
    }
  }, [refresh]);
  useEffect(() => {
    const initial = setTimeout(() => {
      void refresh();
      void sync();
    }, 0);
    const interval = setInterval(() => {
      void refresh();
      void sync();
    }, 15000);
    const clock = setInterval(
      () => setNow(Date.now() + clockOffset.current),
      1000,
    );
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [refresh, sync]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const displayWheel = state?.wheel?.fresh ? state.wheel : directWheel;
  const measurement = displayWheel?.measurement;
  const fresh =
    !!displayWheel?.fresh &&
    !!measurement &&
    now - Date.parse(measurement.receivedAt) <=
      measurement.staleAfterSeconds * 1000 &&
    now - Date.parse(measurement.observedAt) <=
      measurement.staleAfterSeconds * 1000;
  const browserDisplay = !!directWheel && !state?.wheel?.fresh;
  const sourceDenied =
    syncDenied || !!state?.sourceError?.includes("Squeekchain HTTP 403");
  const round = state?.rounds
    .filter((r) => r.status === "open" && Number(r.locks_at) > now)
    .sort((a, b) => Number(a.starts_at) - Number(b.starts_at))[0];
  const prediction = state?.predictions.find((p) => p.round_id === round?.id);
  const feedReady =
    !!state?.feed.caught_up && now - Number(state.feed.coverage_end) < 120000;
  const sprintValid =
    fresh && sprint && sprint.epoch === measurement?.counterEpoch;
  const sprintWork =
    sprintValid && measurement
      ? BigInt(measurement.cumulativeWorkUnits) - BigInt(sprint.start)
      : 0n;
  const progress =
    sprintWork > 0n ? Math.min(100, Number((sprintWork * 100n) / 60n)) : 0;
  const stats = state?.profile;
  async function createProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await request("/api/profile", { nickname, avatar });
      await refresh();
      setProfileOpen(false);
      setNotice("Welcome to the starting grid!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create profile");
    } finally {
      setBusy(false);
    }
  }
  async function lockPrediction() {
    if (!state?.player) {
      setProfileOpen(true);
      return;
    }
    if (!selection || !round) return;
    setBusy(true);
    try {
      await request("/api/predict", { roundId: round.id, choice: selection });
      await refresh();
      setNotice("Prediction locked. Let the little paws decide.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prediction failed");
    } finally {
      setBusy(false);
    }
  }
  async function loadDaily() {
    if (!state?.player) {
      setProfileOpen(true);
      return;
    }
    setBusy(true);
    try {
      setDaily(await request<Daily>("/api/daily"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "History unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function answerDaily(choice: Choice) {
    setBusy(true);
    try {
      const result = await request<Daily>("/api/daily", {
        choice,
        day: daily?.day,
      });
      setDaily(result);
      await refresh();
      setNotice(
        result.correct
          ? "Great read! +25 daily participation points."
          : "A little surprise! +25 daily participation points.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again later");
    } finally {
      setBusy(false);
    }
  }
  function startSprint() {
    if (!fresh || !measurement) return;
    setSprint({
      epoch: measurement.counterEpoch,
      start: measurement.cumulativeWorkUnits,
    });
    setNotice("Sprint started! Every new accepted passage moves your racer.");
  }
  const rangeText = (id: Choice, thresholds?: Thresholds) =>
    !thresholds
      ? "Calibrating…"
      : id === "cozy"
        ? "0 passages"
        : id === "cruise"
          ? `1–${integer(thresholds.high)} passages`
          : `${integer((BigInt(thresholds.high) + 1n).toString())}+ passages`;

  const predictionPanel = (
    <section className="panel prediction-panel" id="prediction">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MAKE YOUR CALL</span>
          <h2>
            Predict the wheel <Target size={19} />
          </h2>
        </div>
        <span className="pill violet">+100 pts</span>
      </div>
      <p className="muted">
        How many accepted wheel passages in the next two-minute window?
      </p>
      <div className="round-strip">
        <span>
          <Radio size={13} />
          {round
            ? `${time(round.starts_at)} – ${time(round.ends_at)}`
            : "Syncing hardware history"}
        </span>
        <span className="countdown">
          <Clock3 size={13} />
          {round
            ? `Locks in ${duration(Number(round.locks_at) - now)}`
            : "Evidence first. Always."}
        </span>
      </div>
      <div className="prediction-options">
        {choices.map(({ id, name, subtitle, icon: Icon, color }) => (
          <button
            key={id}
            className={`prediction-option ${color} ${selection === id || prediction?.choice === id ? "selected" : ""}`}
            onClick={() => setSelection(id)}
            disabled={!!prediction || busy}
            aria-pressed={selection === id || prediction?.choice === id}
          >
            <div className="choice-symbol">
              <Icon size={23} />
            </div>
            <strong>{name}</strong>
            <span className="range">{rangeText(id, round?.thresholds)}</span>
            <small>{subtitle}</small>
            <span className="radio-choice">
              {(selection === id || prediction?.choice === id) && (
                <Check size={12} />
              )}
            </span>
          </button>
        ))}
      </div>
      <Button
        className="lock-button"
        onClick={lockPrediction}
        disabled={
          busy ||
          !!prediction ||
          (!round && !!state?.player) ||
          (!selection && !!state?.player) ||
          (!feedReady && !!state?.player)
        }
      >
        <LockKeyhole size={16} />
        {prediction
          ? "Prediction securely locked"
          : !state?.player
            ? "Create racer & make a prediction"
            : !feedReady
              ? "Synchronizing verified history…"
              : "Lock my prediction"}
        {!prediction && <ArrowRight size={17} />}
      </Button>
      <div className="fine-print">
        <ShieldCheck size={13} /> Server locks before the window. Points only
        after complete evidence.
      </div>
    </section>
  );
  const sprintPanel = (
    <>
      <MatchRace
        player={state?.player ?? null}
        onJoin={() => setProfileOpen(true)}
      />
      <details className="live-companion">
        <summary>Offline practice · results are not saved</summary>
        <PracticeRace />
      </details>
      <details className="live-companion">
        <summary>
          Live wheel companion · moves only when the real hamster runs
        </summary>
        <section className="panel sprint-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">REAL PAWS. REAL PROGRESS.</span>
              <h2>
                Live Wheel Companion <Flag size={19} />
              </h2>
            </div>
            <span className={`pill ${fresh ? "cyan" : "neutral"}`}>
              <span className="dot" />
              {fresh ? "HARDWARE FEED" : "FEED UNAVAILABLE"}
            </span>
          </div>
          <div className="sprint-stage">
            <div className="stage-grid" />
            <div className="arena-moon" />
            <div className="arena-label">
              SQUEEK CIRCUIT <span>01</span>
            </div>
            <div className="grandstand grandstand-one" />
            <div className="grandstand grandstand-two" />
            <div className="speed-lines">
              <i />
              <i />
              <i />
            </div>
            <div className="track">
              <div className="track-inner" />
              <div className="track-dash" />
            </div>
            <div className="finish-flag">
              <Flag size={24} />
              <span>60</span>
            </div>
            <motion.div
              className="racer"
              initial={false}
              animate={{ left: `${23 + progress * 0.47}%` }}
              transition={{ duration: 1.4, ease: "easeOut" }}
            >
              <span className="racer-name">
                {state?.player?.nickname ?? "YOUR RACER"}
              </span>
              <Hamster
                color={
                  ["orange", "violet", "cyan", "pink"][
                    state?.player?.avatar ?? 0
                  ]
                }
              />
              <div className="racer-shadow" />
            </motion.div>
            <div className="track-bottom">
              <span>
                <span className="dot" />{" "}
                {fresh
                  ? measurement?.coreStatus === "ACTIVE"
                    ? "WHEEL ACTIVE"
                    : "SQUEEKTOSHI IS RESTING"
                  : "WAITING FOR HARDWARE"}
              </span>
              <span>
                {sprint
                  ? `${sprintWork > 0n ? sprintWork.toString() : 0} / 60 passages`
                  : "READY WHEN YOU ARE"}
              </span>
            </div>
            {progress >= 100 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="finish-message"
              >
                <Trophy /> PAWSOME FINISH!
              </motion.div>
            )}
          </div>
          <div className="sprint-controls">
            <div>
              <strong>
                {sprint
                  ? `${progress}% of your sprint`
                  : "One real wheel. Your own little race."}
              </strong>
              <small>
                {sprint && !sprintValid
                  ? "Feed paused or counter changed. Restart when fresh."
                  : "Visualizes accepted hardware passages. Sprint awards no ranked points."}
              </small>
            </div>
            <Button variant="outline" onClick={startSprint} disabled={!fresh}>
              {sprint ? <RotateCcw size={15} /> : <Flag size={15} />}{" "}
              {sprint ? "Restart" : "Start sprint"}
            </Button>
          </div>
        </section>
      </details>
    </>
  );
  const leaderboardPanel = (
    <section className="panel leaderboard-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE PADDOCK</span>
          <h2>
            Top squeekers <Trophy size={19} />
          </h2>
        </div>
        <Link className="text-link" href="/leaderboard">
          View all <ArrowUpRight size={15} />
        </Link>
      </div>
      {state?.leaderboard.length ? (
        <div className="leader-list">
          {state.leaderboard
            .slice(0, page === "leaderboard" ? 100 : 4)
            .map((p, index) => (
              <div className="leader-row" key={p.id}>
                <span className={`rank rank-${index}`}>
                  {index === 0 ? (
                    <Trophy size={16} />
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </span>
                <div className={`mini-avatar avatar-${p.avatar}`}>
                  <Hamster
                    color={["orange", "violet", "cyan", "pink"][p.avatar]}
                  />
                </div>
                <div className="leader-name">
                  <strong>{p.nickname}</strong>
                  <span>
                    {p.total
                      ? `${Math.round((p.correct / p.total) * 100)}% accuracy · ${p.total} predictions`
                      : "Daily explorer"}
                  </span>
                </div>
                <strong className="leader-points">
                  {p.points.toLocaleString()} <small>pts</small>
                </strong>
              </div>
            ))}
        </div>
      ) : (
        <div className="empty-board">
          <Trophy size={30} />
          <strong>The podium is waiting.</strong>
          <p>
            No invented champions here. Complete a daily challenge or settle
            your first prediction to join.
          </p>
          <Button variant="outline" onClick={loadDaily}>
            Take the daily challenge <ArrowRight size={15} />
          </Button>
        </div>
      )}
    </section>
  );
  const dailyPanel = (
    <section className="panel daily-panel">
      <div className="daily-art">
        <Hamster color="cyan" helmet={false} />
        <div className="daily-star">✦</div>
      </div>
      <div className="daily-content">
        <span className="eyebrow">A LITTLE EVERY DAY</span>
        <h2>The daily squeek</h2>
        <p>
          Read a real moment from the wheel’s history.
          <br />
          Make your call. Learn its story.
        </p>
        <Button variant="outline" onClick={loadDaily} disabled={busy}>
          Play daily challenge <ArrowRight size={15} />
        </Button>
        <span className="daily-reward">
          <Sparkles size={13} /> +25 participation points · once per UTC day
        </span>
      </div>
    </section>
  );
  const historyPanel = (
    <section className="panel history-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR TRACK RECORD</span>
          <h2>
            Prediction history <History size={19} />
          </h2>
        </div>
        <span className="pill neutral">
          {state?.predictions.length ?? 0} entries
        </span>
      </div>
      {state?.predictions.length ? (
        <div className="history-list">
          {state.predictions.map((p) => {
            const r = state.rounds.find((r) => r.id === p.round_id);
            return (
              <div className="history-row" key={p.id}>
                <span
                  className={`result-icon ${p.correct === true ? "win" : p.correct === false ? "loss" : "pending"}`}
                >
                  {p.correct === null ? (
                    <Clock3 size={16} />
                  ) : p.correct ? (
                    <Check size={16} />
                  ) : (
                    <X size={16} />
                  )}
                </span>
                <div>
                  <strong>
                    {choices.find((c) => c.id === p.choice)?.name}
                  </strong>
                  <small>
                    {r
                      ? `${time(r.starts_at)} – ${time(r.ends_at)}`
                      : new Date(
                          Number(p.created_at),
                        ).toLocaleDateString()}{" "}
                    ·{" "}
                    {p.points === null
                      ? "Awaiting complete hardware evidence"
                      : `${p.points} points`}
                  </small>
                </div>
                <Button variant="ghost" onClick={() => setReplay(p.round_id)}>
                  Details <ChevronRight size={15} />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-board">
          <Flag size={30} />
          <strong>Your story starts on the grid.</strong>
          <p>
            Lock a prediction and your result will appear here with its
            calculation and evidence.
          </p>
          <Button asChild variant="outline">
            <Link href="/predict">
              Make a prediction <ArrowRight size={15} />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Hamster />
          </span>
          <span>
            SQUEEK<span className="brand-race">RACE</span>
            <small>ARENA</small>
          </span>
        </Link>
        <nav
          aria-label="Main navigation"
          className={mobileNav ? "nav-open" : ""}
        >
          {nav.map(({ path, label, icon: Icon }) => (
            <Link
              href={`/${path}`}
              className={page === path ? "active" : ""}
              key={path}
              onClick={() => setMobileNav(false)}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <span className="network">
            <span className="dot" /> SEPOLIA FEED
          </span>
          <button
            className="profile-button"
            onClick={() => setProfileOpen(true)}
          >
            <span className="profile-orb">
              {state?.player ? (
                <Hamster
                  color={
                    ["orange", "violet", "cyan", "pink"][state.player.avatar]
                  }
                />
              ) : (
                <Users size={16} />
              )}
            </span>
            {state?.player?.nickname ?? "Join the arena"}
            <ChevronRight size={14} />
          </button>
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu size={21} />
          </button>
        </div>
      </header>
      <main>
        <div className="page-topline">
          <span>
            <span className="tiny-diamond" /> THE WORLD’S TINIEST RACING LEAGUE
          </span>
          <Link href="/how-to-play">
            New around here?{" "}
            <span>
              How to play <ArrowUpRight size={13} />
            </span>
          </Link>
        </div>
        {(page === "" || page === "arena" || page === "predict") && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="hero-kicker">
                  <span className="dot" /> ONE HAMSTER. ENDLESS POSSIBILITIES.
                </span>
                <h1>
                  Little paws.
                  <br />
                  <span>Big predictions.</span>
                  <span className="hero-spark">✦</span>
                </h1>
                <p>
                  Real wheel energy. A whole new way to play.
                  <br />
                  Race, predict, and cheer on Squeektoshi.
                </p>
                <div className="hero-buttons">
                  <Button asChild>
                    <a href="#play">
                      <Flag size={17} /> Play now <ArrowRight size={17} />
                    </a>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/how-to-play">
                      <CircleHelp size={16} /> How it works
                    </Link>
                  </Button>
                </div>
                <div className="hero-proof">
                  <span>
                    <ShieldCheck size={14} /> Free to play
                  </span>
                  <span>
                    <Radio size={14} /> Real hardware data
                  </span>
                  <span>
                    <Sparkles size={14} /> Just game points
                  </span>
                </div>
              </div>
              <div className="hero-visual" aria-hidden="true">
                <div className="hero-orbit orbit-one" />
                <div className="hero-orbit orbit-two" />
                <div className="hero-floor" />
                <div className="hero-wheel">
                  <div />
                  <div />
                  <span />
                </div>
                <div className="floating-tag tag-top">
                  <Zap size={16} />
                  <span>
                    100%<small>HAMSTER POWERED</small>
                  </span>
                </div>
                <motion.div
                  className="hero-hamster"
                  animate={{ y: [0, -9, 0], rotate: [-3, 0, -3] }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <Hamster />
                </motion.div>
                <div className="floating-tag tag-bottom">
                  <span className="dot" />
                  <span>
                    SMALL BUT SPEEDY
                    <small>Squeektoshi · The original racer</small>
                  </span>
                </div>
                <div className="floating-star star-one">✦</div>
                <div className="floating-star star-two">✧</div>
                <span className="visual-caption">
                  POWERED BY THE WHEEL. INSPIRED BY THE SQUEEK.
                </span>
              </div>
            </section>
            <div className="telemetry-bar">
              <div className="telemetry-status">
                <span className={`status-light ${fresh ? "online" : ""}`} />
                <div>
                  <strong>
                    {fresh ? "Squeektoshi is online" : "Checking the wheel"}
                  </strong>
                  <small>
                    {fresh
                      ? measurement?.coreStatus === "ACTIVE"
                        ? "Little legs are on the move"
                        : "Taking a well-earned breather"
                      : "Live results pause when data is unavailable"}
                  </small>
                </div>
              </div>
              <div className="telemetry-item">
                <Gauge size={19} />
                <div>
                  <small>WHEEL SPEED</small>
                  <strong>
                    {fresh && measurement ? milli(measurement.rpmMilli) : "—"}
                    <span> RPM</span>
                  </strong>
                </div>
              </div>
              <div className="telemetry-item">
                <Zap size={19} />
                <div>
                  <small>ACCEPTED WORK</small>
                  <strong>
                    {fresh && measurement
                      ? integer(measurement.cumulativeWorkUnits)
                      : "—"}
                    <span> passages / epoch</span>
                  </strong>
                </div>
              </div>
              <div className="telemetry-item">
                <Clock3 size={19} />
                <div>
                  <small>LAST OBSERVED</small>
                  <strong className="last-observed">
                    {measurement
                      ? new Date(measurement.observedAt).toLocaleTimeString()
                      : "Waiting…"}
                    <span> local time</span>
                  </strong>
                </div>
              </div>
              <button
                className="icon-button"
                aria-label="Refresh real hardware data"
                onClick={() => {
                  setError("");
                  void sync();
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
            {(sourceDenied || browserDisplay) && (
              <div className="source-notice" role="status">
                <Info size={16} />
                <span>
                  {browserDisplay && fresh
                    ? "Live wheel telemetry is read directly from the official public API for display only. "
                    : "Trusted server telemetry is unavailable or stale. "}
                  {feedReady
                    ? "Predictions use trusted server history only, never browser readings. "
                    : "Predictions are paused until trusted server history catches up. "}
                  Grand Prix remains playable with its disclosed server energy
                  settings.
                </span>
              </div>
            )}
          </>
        )}
        {page === "" && (
          <>
            <div className="section-title">
              <div>
                <span className="eyebrow">READY, SET, SQUEEK!</span>
                <h2>Your next little adventure.</h2>
              </div>
              <span className="soft-label">
                <span className="dot" /> All play. No pay.
              </span>
            </div>
            <div className="game-grid">
              <div>
                {sprintPanel}
                {dailyPanel}
              </div>
              <div>
                {predictionPanel}
                {leaderboardPanel}
              </div>
            </div>
          </>
        )}
        {page === "arena" && (
          <div className="game-grid">
            <div>
              {sprintPanel}
              {dailyPanel}
            </div>
            <div>{predictionPanel}</div>
          </div>
        )}
        {page === "predict" && (
          <div className="game-grid">
            <div>
              {predictionPanel}
              {historyPanel}
            </div>
            <aside className="panel rules-note">
              <ShieldCheck size={28} />
              <h2>A fair starting line.</h2>
              <p>
                Your choice locks before a future two-minute measurement window
                starts. Ranges freeze at round creation using up to 240 complete
                past windows.
              </p>
              <p>
                Cozy means zero passages. Cruise means up to the median positive
                historical count. Full squeek means above it.
              </p>
              <p>
                We wait two extra minutes and require complete eligible hardware
                evidence. Missing coverage stays pending.
              </p>
              <Link href="/how-to-play" className="text-link">
                Read the rules <ArrowRight size={15} />
              </Link>
            </aside>
          </div>
        )}
        {page === "leaderboard" && (
          <>
            <PageTitle
              kicker="LITTLE LEGENDS"
              title="The community podium."
              text="Earn your place with real predictions and daily participation. Free, non-transferable game points."
            />
            <div className="game-grid">
              <div>{leaderboardPanel}</div>
              <div>
                {dailyPanel}
                <section className="panel rules-note">
                  <Trophy size={27} />
                  <h2>Every squeek counts.</h2>
                  <p>
                    +100 for a correct future prediction. +50 on every third
                    consecutive win. +25 for completing a daily challenge.
                  </p>
                  <p>
                    Ranked by points, then prediction accuracy, participation,
                    and stable player ID. Anonymous profiles have limited abuse
                    protection, not full Sybil resistance.
                  </p>
                </section>
              </div>
            </div>
          </>
        )}
        {page === "history" && (
          <>
            <PageTitle
              kicker="EVERY LAP HAS A STORY"
              title="Your racing journal."
              text="Review locked predictions, results, points, and the measurements behind them."
            />
            {historyPanel}
          </>
        )}
        {page === "how-to-play" && (
          <>
            <PageTitle
              kicker="SMALL LEARNING CURVE"
              title="Find your wheel instinct."
              text="One real hamster. Three ways to play. Absolutely no money on the line."
            />
            <div className="guide-grid">
              <section className="panel guide-card">
                <span>GP</span>
                <Flag size={26} />
                <h2>Main race · Grand Prix</h2>
                <p>
                  Create a racer and press Start race. After a three-second
                  countdown, race two AI opponents. Use ← → or A/D to dodge
                  crates and Space to boost. The server calculates positions,
                  finish times, and saved standings. Distances are virtual game
                  metres; this is not human multiplayer.
                </p>
                <Link className="text-link" href="/arena#play">
                  Enter the race <ArrowRight size={14} />
                </Link>
              </section>
              {[
                {
                  n: "01",
                  icon: Users,
                  title: "Meet your racer",
                  text: "Choose an original hamster avatar and a nickname. Your profile lives on the server and is linked to a secure browser session. No wallet required.",
                },
                {
                  n: "02",
                  icon: Target,
                  title: "Read the wheel",
                  text: "Choose Cozy paws (zero), Cruise control (up to the historical active median), or Full squeek (above it). Ranges are fixed before the future window.",
                },
                {
                  n: "03",
                  icon: LockKeyhole,
                  title: "Lock it in",
                  text: "Your choice locks before the two-minute window begins. One prediction per profile per round. You cannot edit it, submit it late, or change the score.",
                },
                {
                  n: "04",
                  icon: Trophy,
                  title: "Wait. Cheer. Celebrate.",
                  text: "After the window, the server waits for complete hardware passage records. Correct predictions earn 100 points. Every third consecutive correct prediction adds 50.",
                },
                {
                  n: "05",
                  icon: Flag,
                  title: "Make a little sprint",
                  text: "Start a personal race to 60 new accepted wheel passages. Live telemetry moves your original racer. Wheel rests pause the race; sprints award no ranked points.",
                },
                {
                  n: "06",
                  icon: Sparkles,
                  title: "Play the daily squeek",
                  text: "Classify a real completed historical window. Get 25 participation points once per UTC day. Historical answers are public, so this never increases ranked prediction accuracy.",
                },
              ].map(({ n, icon: Icon, title, text }) => (
                <section className="panel guide-card" key={n}>
                  <span>{n}</span>
                  <Icon size={26} />
                  <h2>{title}</h2>
                  <p>{text}</p>
                </section>
              ))}
            </div>
            <section className="panel prose">
              <h2>The evidence behind the fun</h2>
              <p>
                Live predictions use future UTC-aligned two-minute windows, with
                a minimum 30-second lead before start. We count accepted
                eligible hardware passages with timestamps in [start, end). A
                work unit is a wheel-magnet passage, not necessarily a complete
                revolution. All cumulative values remain integers.
              </p>
              <p>
                Windows require full coverage, no discontinuity inside the
                window, no duplicate passages, and hardware provenance.
                Incomplete or disputed evidence never awards prediction points.
                The server adds a two-minute ingestion delay and retains
                references and SHA-256 evidence digests.
              </p>
              <p>
                These are API-verified measurement results, not
                SqueekCore-certified work or independently verified device
                signatures. The live API contract identity currently differs
                from the published deployment record, so this game does not
                claim chain settlement verification.
              </p>
              <Button asChild>
                <Link href="/predict">
                  I’m ready to squeek <ArrowRight size={16} />
                </Link>
              </Button>
            </section>
          </>
        )}
        {page === "about" && (
          <>
            <PageTitle
              kicker="BUILT FOR THE LITTLE GUY"
              title="Real activity. Original play."
              text="SqueekRace Arena — Race, Predict & Play with Squeektoshi's Real-World Wheel Activity."
            />
            <div className="game-grid">
              <section className="panel prose">
                <Hamster className="about-hamster" />
                <h2>A tiny racer with a real connection.</h2>
                <p>
                  SqueekRace Arena turns accepted real-world wheel measurements
                  into a playful prediction arena, a personal sprint, and a
                  daily history challenge. The hamster art and circuit are
                  original SVG and CSS illustrations.
                </p>
                <p>
                  Only free, off-chain, non-transferable game points exist here.
                  There are no deposits, issued tokens, cash wagers, SQK prizes,
                  or airdrop promises.
                </p>
                <h2>Honest about attribution.</h2>
                <p>
                  This development version was created in Codex. It has not been
                  attributed to an IMD project and is not approved for any
                  Genesis badge. IMD ownership, first-job payment, a verified
                  Genesis wallet, and official review are still required.
                </p>
                <a
                  className="text-link"
                  href="https://squeekchain.com/genesis/code"
                  target="_blank"
                  rel="noreferrer"
                >
                  Official Genesis Code requirements <ArrowUpRight size={16} />
                </a>
              </section>
              <section className="panel prose">
                <h2>Built on evidence.</h2>
                <p>
                  The game reads the official public Squeekchain API. Accepted
                  hardware passages power gameplay; telemetry powers the visual
                  sprint. API unavailability pauses live play.
                </p>
                <p>
                  The live API’s Core address differs from the published
                  deployment record. Chain-certified gameplay is disabled
                  pending reconciliation. The app does not sign or send
                  transactions.
                </p>
                <div className="about-links">
                  <a
                    href="https://docs.squeekchain.com/developers/api/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official API documentation <ArrowUpRight size={16} />
                  </a>
                  <a
                    href="https://squeekchain.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Squeekchain <ArrowUpRight size={16} />
                  </a>
                  <a
                    href="https://imd.fun/docs/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    IMD Swarm documentation <ArrowUpRight size={16} />
                  </a>
                </div>
                <h2>Your profile</h2>
                <p>
                  Anonymous access uses an HttpOnly session cookie. Clearing it
                  loses access to this profile. Profiles expire after 90 days.
                  Nicknames and leaderboard statistics are public. Rate limits
                  reduce casual abuse; multiple identities remain possible.
                </p>
              </section>
            </div>
          </>
        )}
        <section className="player-strip">
          <div className="player-strip-title">
            <Flame size={22} />
            <div>
              <strong>
                {state?.player
                  ? `${state.player.nickname}’s pit stop`
                  : "Your next streak starts here."}
              </strong>
              <span>
                {state?.player
                  ? "Little wins, one squeek at a time."
                  : "Pick a racer. Make a call. Join the fun."}
              </span>
            </div>
          </div>
          <div>
            <small>GAME POINTS</small>
            <strong>
              {stats?.points.toLocaleString() ?? 0}
              <span> pts</span>
            </strong>
          </div>
          <div>
            <small>PREDICTION ACCURACY</small>
            <strong>
              {stats?.total
                ? Math.round((stats.correct / stats.total) * 100)
                : "—"}
              <span>{stats?.total ? "%" : ""}</span>
            </strong>
          </div>
          <div>
            <small>CURRENT STREAK</small>
            <strong>
              {stats?.streak ?? 0}
              <Flame size={17} />
            </strong>
          </div>
          <Button variant="outline" onClick={() => setProfileOpen(true)}>
            {state?.player ? "My racer" : "Create your racer"}
            <ArrowRight size={15} />
          </Button>
        </section>
        <div className="data-disclosure">
          <Info size={15} />
          <span>
            Measurement-powered play · API hardware evidence, not
            chain-certified work. Live chain identity differs from the published
            record.{" "}
            <Link href="/about">
              See integration notes <ArrowUpRight size={12} />
            </Link>
          </span>
        </div>
      </main>
      <footer>
        <Link className="footer-brand" href="/">
          SQUEEKRACE <span>ARENA</span>
        </Link>
        <span>
          Little paws. Big energy. Made for the Squeekchain community.
        </span>
        <div>
          <Link href="/how-to-play">How to play</Link>
          <Link href="/about">About & fairness</Link>
          <a
            href="https://docs.squeekchain.com/"
            target="_blank"
            rel="noreferrer"
          >
            Official docs <ArrowUpRight size={12} />
          </a>
          <button
            className="icon-button"
            aria-label={muted ? "Enable sound" : "Mute sound"}
            onClick={() => {
              setMuted(!muted);
              if (muted) {
                const context = new AudioContext();
                const oscillator = context.createOscillator();
                const gain = context.createGain();
                oscillator.connect(gain);
                gain.connect(context.destination);
                gain.gain.value = 0.04;
                oscillator.frequency.value = 620;
                oscillator.start();
                gain.gain.exponentialRampToValueAtTime(
                  0.001,
                  context.currentTime + 0.15,
                );
                oscillator.stop(context.currentTime + 0.15);
                oscillator.onended = () => void context.close();
              }
            }}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </footer>
      <AnimatePresence>
        {notice.startsWith("Prediction won!") && (
          <div className="celebration" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => (
              <motion.i
                key={index}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{
                  x: (index - 5.5) * 28,
                  y: -80 - (index % 4) * 38,
                  opacity: 0,
                  rotate: index * 60,
                }}
                transition={{ duration: 1.6, delay: index * 0.025 }}
              />
            ))}
          </div>
        )}
        {notice && (
          <motion.div
            role="status"
            className="toast success"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Sparkles size={19} />
            {notice}
            <button
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </motion.div>
        )}
        {error && (
          <motion.div
            role="alert"
            className="toast error"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          >
            <Info size={18} />
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {profileOpen && (
        <Modal
          title={
            state?.player ? "Your little legend" : "Meet your little legend"
          }
          onClose={() => setProfileOpen(false)}
        >
          {state?.player ? (
            <>
              <Hamster
                className="profile-large"
                color={
                  ["orange", "violet", "cyan", "pink"][state.player.avatar]
                }
              />
              <h3 className="profile-name">{state.player.nickname}</h3>
              <p className="muted">
                {stats?.points ?? 0} game points · {stats?.streak ?? 0} win
                streak
              </p>
              <p className="fine-print">
                This profile is linked to this browser’s secure cookie. No
                wallet or private keys needed.
              </p>
            </>
          ) : (
            <form onSubmit={createProfile}>
              <p className="muted">Choose your pit crew personality.</p>
              <div className="avatar-picker">
                {["orange", "violet", "cyan", "pink"].map((color, index) => (
                  <button
                    type="button"
                    key={color}
                    aria-label={`Select ${color} hamster`}
                    aria-pressed={avatar === index}
                    className={avatar === index ? "chosen" : ""}
                    onClick={() => setAvatar(index)}
                  >
                    <Hamster color={color} />
                  </button>
                ))}
              </div>
              <label className="input-label" htmlFor="nickname">
                Racer nickname
              </label>
              <input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                minLength={2}
                maxLength={20}
                required
                placeholder="e.g. TurboPeanut"
                autoComplete="nickname"
              />
              <p className="fine-print">
                2–20 letters, numbers, spaces, _ or -. Public on the
                leaderboard. One anonymous browser profile; no account recovery.
              </p>
              <Button type="submit" disabled={busy}>
                Let’s squeek <ArrowRight size={16} />
              </Button>
            </form>
          )}
        </Modal>
      )}
      {daily && (
        <Modal title="The daily squeek" onClose={() => setDaily(null)}>
          <span className="pill violet">
            {daily.day} · Historical challenge
          </span>
          <p className="muted">
            What happened during this real two-minute window?{" "}
            {new Date(daily.start).toLocaleString()} – {time(daily.end)}.
          </p>
          {daily.completed ? (
            <div className="daily-result">
              <Hamster className="profile-large" color="cyan" />
              {daily.correct ? (
                <h3>Sharp little instincts!</h3>
              ) : (
                <h3>A surprise from Squeektoshi!</h3>
              )}
              <strong>{integer(daily.work ?? "0")} accepted passages</strong>
              <p>
                {choices.find((c) => c.id === daily.outcome)?.name} · +25
                participation points.
              </p>
              <p className="fine-print">
                This is a historical learning challenge. Its accuracy is not
                added to ranked future predictions.
              </p>
            </div>
          ) : (
            <>
              <p>Choose the activity range:</p>
              <div className="daily-choices">
                {choices.map((c) => (
                  <Button
                    key={c.id}
                    variant="outline"
                    onClick={() => answerDaily(c.id)}
                    disabled={busy}
                  >
                    {c.name}
                    <small>{rangeText(c.id, daily.thresholds)}</small>
                  </Button>
                ))}
              </div>
              <p className="fine-print">
                +25 points for participation, regardless of answer. Once per UTC
                day.
              </p>
            </>
          )}
        </Modal>
      )}
      {replay && (
        <Modal title="Behind this prediction" onClose={() => setReplay(null)}>
          <RoundReplay id={replay} />
        </Modal>
      )}
    </div>
  );
}
function PageTitle({
  kicker,
  title,
  text,
}: {
  kicker: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-title">
      <span className="eyebrow">{kicker}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, a[href], summary",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={ref}
      >
        <div className="section-heading">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
