"use client";
import { useEffect, useState } from "react";
import { Flag, RotateCcw } from "lucide-react";
import type { Round } from "@/lib/game";
import { Hamster } from "./hamster";
import { Button } from "./ui/button";
type Data = {
  round: Round;
  prediction: {
    choice: string;
    points: number | null;
    correct: boolean | null;
  };
  timeline: number[];
};
export function RoundReplay({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch(`/api/round?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (live) setData(result);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setFrame((f) => Math.min(24, f + 1));
    }, 250);
    return () => clearInterval(timer);
  }, [playing]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading retained evidence…</p>;
  const { round: r, prediction: p, timeline } = data;
  const work = timeline.slice(0, frame).reduce((n, v) => n + v, 0);
  const total = timeline.reduce((n, v) => n + v, 0);
  return (
    <div className="replay-detail">
      <span className="pill cyan">{r.status.toUpperCase()}</span>
      <h3>
        {new Date(Number(r.starts_at)).toLocaleString()} –{" "}
        {new Date(Number(r.ends_at)).toLocaleTimeString()}
      </h3>
      <p>
        Your choice: <strong>{p.choice}</strong>
      </p>
      <p>
        Result:{" "}
        <strong>
          {r.work === null
            ? "Awaiting complete evidence"
            : `${BigInt(r.work).toLocaleString()} accepted hardware passages`}
        </strong>
      </p>
      {r.status === "settled" && (
        <>
          <div className="replay-track">
            <div style={{ left: `${15 + (total ? work / total : 0) * 65}%` }}>
              <Hamster />
            </div>
            <Flag />
            <span>
              {work} / {total} passages · {frame * 5}s / 120s
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setFrame(0);
              setPlaying(true);
            }}
          >
            <RotateCcw size={15} />
            Replay actual passage timeline
          </Button>
          <p className="fine-print">
            24 five-second buckets from retained passage timestamps, compressed
            into six seconds. No invented motion between recorded events.
          </p>
        </>
      )}
      <p>
        Frozen ranges: 0 / 1–{r.thresholds.high} /{" "}
        {BigInt(r.thresholds.high) + 1n}+. {r.thresholds.samples} historical
        calibration windows.
      </p>
      <p>
        {p.points === null
          ? "No points awarded until verification completes."
          : `${p.points} points = ${p.correct ? "100 correct prediction points, plus any third-win bonus" : "0 for an incorrect prediction"}.`}
      </p>
      <details>
        <summary>Source references & calculation evidence</summary>
        <pre>{JSON.stringify(r.evidence, null, 2) ?? "Pending"}</pre>
      </details>
    </div>
  );
}
