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
    throw new Error(data.error ?? "Không kết nối được server trận đấu");
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
            setError("Chưa kết nối được server. Bấm thử lại trước khi đua.");
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
              "Mất kết nối tạm thời. Server vẫn giữ trận đấu; đang kết nối lại…",
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
      setError(e instanceof Error ? e.message : "Không tạo được trận");
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
            e instanceof Error ? e.message : "Không gửi được điều khiển",
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
      name: player?.nickname ?? "Bạn",
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
          <span className="eyebrow">
            TRẬN ĐẤU CHÍNH · SERVER ĐIỀU KHIỂN KẾT QUẢ
          </span>
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
        Bạn đua với <strong>2 đối thủ AI</strong>. Đổi làn né thùng, nhặt năng
        lượng và tăng tốc. Về đích nhanh nhất để giành hạng 1!
      </p>
      <div className="match-source">
        <Zap size={13} />
        {match?.wheel.available
          ? `Năng lượng bánh xe tại xuất phát: ${match.wheel.active ? "đang hoạt động · hồi 7%/giây" : "đang nghỉ · hồi 5%/giây"}`
          : "Bản đồ mô phỏng · dùng mức năng lượng chuẩn khi chưa có dữ liệu thật"}
      </div>
      <div className="match-hud">
        <span>
          HẠNG <strong data-testid="match-rank">{human?.rank ?? "—"}/3</strong>
        </span>
        <span>
          <Zap size={15} />
          {Math.floor((human?.energy ?? 10000) / 100)}%
        </span>
        <span data-testid="match-distance" data-distance={humanDistance}>
          {Math.floor(humanDistance / 1000)} / 1000 m ảo
        </span>
        <span>{((match?.tick ?? 0) * 0.05).toFixed(1)}s</span>
      </div>
      <div className="match-grid-order" aria-label="Live race standings">
        {actors.map((r) => (
          <div key={r.id} className={!r.ai ? "your-position" : ""}>
            <span>
              {r.rank}. {r.ai ? `${r.name} · AI` : "BẠN"}
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
          {racing
            ? "ĐANG ĐUA · ← → ĐỔI LÀN · SPACE TĂNG TỐC"
            : "SQUEEK GRAND PRIX"}
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
              <span>{r.ai ? `${r.name} · AI` : "BẠN"}</span>
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
                <strong>Đua cùng 2 đối thủ AI</strong>
                <span>
                  Xuất phát → điều khiển → về đích → server xác nhận thứ hạng
                </span>
                <Button onClick={start} disabled={busy}>
                  <Flag size={17} />
                  {busy
                    ? "Đang tạo trận…"
                    : player
                      ? "Bắt đầu trận đấu"
                      : "Tạo racer để thi đấu"}
                </Button>
              </>
            ) : match.status === "countdown" ? (
              <>
                <strong className="practice-countdown">{count || "GO!"}</strong>
                <span>Trận đã tạo trên server · sẵn sàng đổi làn!</span>
              </>
            ) : match.status === "finished" ? (
              <>
                <Trophy size={30} />
                <strong>VỀ ĐÍCH · HẠNG {human?.rank}/3</strong>
                <span>
                  <ShieldCheck size={14} /> Kết quả đã được server xác nhận và
                  lưu
                </span>
                <Button onClick={start} disabled={busy}>
                  Đua trận mới
                </Button>
              </>
            ) : (
              <>
                <strong>Bạn đã về đích!</strong>
                <span>Server đang chờ các đối thủ AI hoàn thành…</span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="practice-controls">
        <Button
          variant="outline"
          aria-label="Lái trái"
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
          Tăng tốc · 35%
        </Button>
        <Button
          variant="outline"
          aria-label="Lái phải"
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
                .catch(() => setError("Chưa kết nối được server. Thử lại sau."))
            }
          >
            Thử lại kết nối
          </button>
        </div>
      )}
      {match?.status === "finished" && (
        <div className="match-result" data-testid="confirmed-race-result">
          <h3>
            <ShieldCheck size={18} /> Bảng kết quả chính thức của trận
          </h3>
          {match.riders.map((r) => (
            <div key={r.id}>
              <strong>
                #{r.rank} {r.name} {r.ai ? "(AI)" : "(Bạn)"}
              </strong>
              <span>
                {r.finishMs !== null ? (r.finishMs / 1000).toFixed(3) : "—"}s ·{" "}
                {r.hits} va chạm
              </span>
            </div>
          ))}
          <details>
            <summary>
              <LockKeyhole size={12} /> Mã xác nhận & luật tái lập
            </summary>
            <p>
              Match: {match.id}
              <br />
              Luật: {match.version}
              <br />
              SHA-256: {match.resultDigest}
            </p>
          </details>
        </div>
      )}
      <div className="match-board">
        <h3>
          <Trophy size={17} /> Bảng thành tích đua · server lưu
        </h3>
        {board.length ? (
          board.slice(0, 5).map((entry, index) => (
            <div key={entry.match_id}>
              <span>
                {index + 1}. {entry.nickname}
              </span>
              <strong>
                Hạng {entry.rank}/3 · {(entry.finish_ms / 1000).toFixed(2)}s
              </strong>
            </div>
          ))
        ) : (
          <p>Hoàn thành trận đầu tiên để ghi thành tích.</p>
        )}
      </div>
      <p className="fine-print">
        Đối thủ là AI mô phỏng, chưa phải multiplayer. Server nhận điều khiển và
        tính toàn bộ quãng đường, va chạm, thời gian và thứ hạng. Thành tích đua
        tách khỏi điểm dự đoán dữ liệu thật. Không có cược hay phần thưởng
        tiền/token.
      </p>
    </section>
  );
}
