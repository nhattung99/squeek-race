"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  Heart,
  RotateCcw,
  Zap,
} from "lucide-react";
import { initialArcade, arcadeStep, course } from "@/lib/arcade";
import { Hamster } from "./hamster";
import { Button } from "./ui/button";
export function PracticeRace() {
  const [race, setRace] = useState(initialArcade);
  const [countdown, setCountdown] = useState<number | null>(null);
  const region = useRef<HTMLElement>(null);
  const steer = useCallback(
    (direction: number) =>
      setRace((s) =>
        s.status === "racing"
          ? { ...s, lane: Math.max(0, Math.min(2, s.lane + direction)) }
          : s,
      ),
    [],
  );
  const boost = useCallback(
    () =>
      setRace((s) =>
        s.status === "racing" && s.charge >= 35 && s.boost === 0
          ? { ...s, charge: s.charge - 35, boost: 2 }
          : s,
      ),
    [],
  );
  function start() {
    setRace(initialArcade());
    setCountdown(3);
    region.current?.focus();
  }
  useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (countdown === 1) {
        setCountdown(null);
        setRace((s) => ({ ...s, status: "racing" }));
      } else setCountdown(countdown - 1);
    }, 700);
    return () => clearTimeout(timer);
  }, [countdown]);
  useEffect(() => {
    if (race.status !== "racing") return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      // Embedded browser visibility flags can report hidden while the game is
      // on screen. Advance this explicitly started practice race by timer time.
      setRace((s) => arcadeStep(s, dt));
    }, 50);
    return () => clearInterval(timer);
  }, [race.status]);
  return (
    <section
      id="practice"
      className="panel practice-panel"
      ref={region}
      tabIndex={0}
      aria-label="Arcade practice race"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (["ArrowLeft", "a", "A"].includes(e.key)) {
          e.preventDefault();
          steer(-1);
        }
        if (["ArrowRight", "d", "D"].includes(e.key)) {
          e.preventDefault();
          steer(1);
        }
        if (e.code === "Space") {
          e.preventDefault();
          boost();
        }
      }}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">PLAY NOW · NO WAITING FOR THE HAMSTER</span>
          <h2>
            Arcade Sprint <Flag size={19} />
          </h2>
        </div>
        <span className="pill violet">PRACTICE</span>
      </div>
      <p className="practice-description">
        Press Start practice to begin. Your racer runs automatically: change
        lanes, dodge crates, collect energy, and boost to the finish. No need to
        wait for 60 passages.
      </p>
      <div className="practice-hud">
        <span>
          <Heart size={14} /> {race.hearts}/3
        </span>
        <span>
          <Zap size={14} /> {Math.floor(race.charge)}%
        </span>
        <span data-testid="practice-distance" data-distance={race.distance}>
          {Math.floor(race.distance)} / 600 m · {race.elapsed.toFixed(1)}s
        </span>
      </div>
      <div className={`practice-road ${race.boost > 0 ? "boosting" : ""}`}>
        <div
          className="practice-lane-lines"
          style={{ backgroundPositionY: `${race.distance * 5}px` }}
        />
        <div className="practice-running-status">
          {race.status === "racing"
            ? race.boost > 0
              ? "⚡ BOOSTING"
              : "RUNNING · ← → CHANGE LANES"
            : "PRACTICE TRACK"}
        </div>
        {race.status === "racing" &&
          course
            .filter(
              (item) =>
                item.at >= race.distance && item.at - race.distance < 160,
            )
            .map((item) => (
              <div
                key={item.id}
                className={`practice-item ${item.kind}`}
                style={{
                  left: `${((item.lane + 0.5) * 100) / 3}%`,
                  top: `${75 - ((item.at - race.distance) / 160) * 80}%`,
                }}
              >
                {item.kind === "energy" ? <Zap size={25} /> : "▧"}
              </div>
            ))}
        <div
          className="practice-hamster"
          style={{ left: `${((race.lane + 0.5) * 100) / 3}%` }}
        >
          <div
            className="practice-runner-body"
            style={{
              transform:
                race.status === "racing"
                  ? `translateY(${Math.sin(race.elapsed * 24) * 4}px) rotate(${Math.sin(race.elapsed * 12) * 4}deg)`
                  : undefined,
            }}
          >
            <Hamster color="orange" />
          </div>
        </div>
        <span className="practice-finish">🏁 600 virtual m</span>
        {(race.status !== "racing" || countdown !== null) && (
          <div className="practice-overlay" role="status">
            {countdown !== null ? (
              <strong className="practice-countdown">{countdown}</strong>
            ) : race.status === "won" ? (
              <>
                <strong>FINISH! 🏆</strong>
                <span>
                  {race.elapsed.toFixed(1)} seconds · {race.collected} energy
                  pickups
                </span>
                <Button onClick={start}>
                  <RotateCcw size={15} />
                  Race again
                </Button>
              </>
            ) : race.status === "lost" ? (
              <>
                <strong>Give it another try!</strong>
                <span>Use ← → to dodge the crates.</span>
                <Button onClick={start}>Race again</Button>
              </>
            ) : (
              <>
                <strong>Ready to race?</strong>
                <span>← → / A D to steer · Space to boost</span>
                <Button onClick={start}>
                  <Flag size={16} />
                  Start practice
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      <progress
        className="practice-progress"
        aria-label="Practice race progress"
        value={race.distance}
        max={600}
      />
      <div className="practice-controls">
        <Button
          variant="outline"
          onClick={() => steer(-1)}
          disabled={race.status !== "racing"}
          aria-label="Change lane left"
        >
          <ArrowLeft size={20} />
        </Button>
        <Button
          onClick={boost}
          disabled={
            race.status !== "racing" || race.charge < 35 || race.boost > 0
          }
        >
          <Zap size={17} />
          Boost
        </Button>
        <Button
          variant="outline"
          onClick={() => steer(1)}
          disabled={race.status !== "racing"}
          aria-label="Change lane right"
        >
          <ArrowRight size={20} />
        </Button>
      </div>
      <p className="fine-print">
        A simulated race controlled by you. This is not real hamster activity.
        Practice does not award leaderboard points or change predictions.
      </p>
      {race.status === "racing" && (
        <button
          className="text-link practice-reset"
          onClick={() => {
            setCountdown(null);
            setRace(initialArcade());
          }}
        >
          Stop practice
        </button>
      )}
    </section>
  );
}
