"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { FormBanner } from "@/components/ui/field";
import { features } from "@/lib/features";
import type { MatchEventType, ReboundKind } from "@/lib/db-types";

export interface ConsolePlayer {
  id: string;
  teamId: string;
  number: number;
  name: string;
}
export interface ConsoleEvent {
  id: string;
  teamId: string;
  playerId: string | null;
  type: MatchEventType;
  made: boolean | null;
  points: number;
}
interface Team {
  id: string;
  short: string;
  name: string;
  color: string;
}

function pointsFor(type: MatchEventType, made?: boolean): number {
  if (!made) return 0;
  if (type === "ft") return 1;
  if (type === "fg2") return 2;
  if (type === "fg3") return 3;
  return 0;
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const eventLabel: Record<string, string> = {
  "ft:true": "+1", "fg2:true": "+2", "fg3:true": "+3",
  "ft:false": "штрафной мимо", "fg2:false": "промах 2", "fg3:false": "промах 3",
  rebound: "подбор", assist: "пас", steal: "перехват",
  block: "блок", turnover: "потеря", foul: "фол",
};
function labelOf(e: ConsoleEvent): string {
  if (e.type === "ft" || e.type === "fg2" || e.type === "fg3")
    return eventLabel[`${e.type}:${e.made}`] ?? e.type;
  return eventLabel[e.type] ?? e.type;
}

export function OperatorConsole({
  matchId,
  status: initialStatus,
  home,
  away,
  players,
  initialEvents,
  initialPeriod,
}: {
  matchId: string;
  status: string;
  home: Team;
  away: Team;
  players: ConsolePlayer[];
  initialEvents: ConsoleEvent[];
  initialPeriod: number;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [status, setStatus] = useState(initialStatus);
  const [period, setPeriod] = useState(initialPeriod);
  const [events, setEvents] = useState<ConsoleEvent[]>(initialEvents);
  const [selected, setSelected] = useState<ConsolePlayer | null>(null);
  const [saving, setSaving] = useState(false);
  const [conn, setConn] = useState<"ok" | "error">("ok");
  const [banner, setBanner] = useState<string | null>(null);
  const [retry, setRetry] = useState<Record<string, unknown> | null>(null);

  // Game clock (per quarter) and timeouts — operator-side only.
  const [quarterSec, setQuarterSec] = useState(600); // 10:00 default
  const [clock, setClock] = useState(600);
  const [clockRunning, setClockRunning] = useState(false);
  const [timeouts, setTimeouts] = useState<{ home: number; away: number }>({ home: 4, away: 4 });
  const [activeTimeout, setActiveTimeout] = useState<{ side: "home" | "away"; left: number } | null>(null);

  // Tick the game clock (paused during a timeout).
  useEffect(() => {
    if (!clockRunning || activeTimeout) return;
    const id = setInterval(() => setClock((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [clockRunning, activeTimeout]);

  useEffect(() => {
    if (clock === 0) setClockRunning(false);
  }, [clock]);

  // Tick the active timeout countdown.
  useEffect(() => {
    if (!activeTimeout) return;
    const id = setInterval(() => {
      setActiveTimeout((t) => (t && t.left > 1 ? { ...t, left: t.left - 1 } : null));
    }, 1000);
    return () => clearInterval(id);
  }, [activeTimeout]);

  const score = useMemo(() => {
    let h = 0, a = 0;
    for (const e of events) {
      if (e.teamId === home.id) h += e.points;
      else if (e.teamId === away.id) a += e.points;
    }
    return { home: h, away: a };
  }, [events, home.id, away.id]);

  const isLive = status === "live";
  const homePlayers = players.filter((p) => p.teamId === home.id);
  const awayPlayers = players.filter((p) => p.teamId === away.id);

  async function refetchEvents() {
    const { data } = await supabase
      .from("match_events")
      .select("id, team_id, player_id, event_type, made, points")
      .eq("match_id", matchId)
      .eq("voided", false)
      .order("created_at", { ascending: true });
    setEvents(
      (data ?? []).map((e) => ({
        id: e.id,
        teamId: e.team_id,
        playerId: e.player_id,
        type: e.event_type,
        made: e.made,
        points: e.points,
      })),
    );
  }

  async function startMatch() {
    setSaving(true);
    const { error } = await supabase.rpc("start_match", { p_match_id: matchId });
    setSaving(false);
    if (error) return setBanner(`Не удалось начать матч: ${error.message}`);
    setStatus("live");
    setPeriod(1);
    setBanner(null);
  }

  async function nextPeriod() {
    const np = period + 1;
    setSaving(true);
    const { error } = await supabase.rpc("advance_period", {
      p_match_id: matchId,
      p_period_number: np,
    });
    setSaving(false);
    if (error) return setBanner(error.message);
    setPeriod(np);
    // Reset the clock for the new quarter.
    setClock(quarterSec);
    setClockRunning(false);
    setActiveTimeout(null);
  }

  async function recordRaw(
    teamId: string,
    playerId: string | null,
    type: MatchEventType,
    opts: { made?: boolean; rebound?: ReboundKind } = {},
  ) {
    if (!isLive) return setBanner("Матч не запущен");

    const clientEventId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    const params: Record<string, unknown> = {
      p_match_id: matchId,
      p_client_event_id: clientEventId,
      p_team_id: teamId,
      p_event_type: type,
      p_player_id: playerId,
      p_game_clock_seconds: clock,
    };
    if (opts.made !== undefined) params.p_made = opts.made;
    if (opts.rebound) params.p_rebound_type = opts.rebound;

    setSaving(true);
    const { data, error } = await supabase.rpc("apply_match_event", params);
    setSaving(false);

    if (error) {
      // Keep the exact params (same client id) so a retry is idempotent.
      setConn("error");
      setRetry(params);
      setBanner("Нет соединения. Событие не подтверждено — нажмите «Повторить».");
      return;
    }
    setConn("ok");
    setRetry(null);
    setBanner(null);
    const res = data as { event_id: string; duplicate: boolean; home_score: number; away_score: number };
    if (!res.duplicate) {
      setEvents((prev) => [
        ...prev,
        {
          id: res.event_id,
          teamId,
          playerId,
          type,
          made: opts.made ?? null,
          points: pointsFor(type, opts.made),
        },
      ]);
    }
  }

  /** Player-attributed action (needs a selected player). */
  function record(type: MatchEventType, opts: { made?: boolean; rebound?: ReboundKind } = {}) {
    if (!selected) return setBanner("Сначала выберите игрока");
    return recordRaw(selected.teamId, selected.id, type, opts);
  }

  /** Team-level quick score (no player attribution). */
  function teamScore(side: "home" | "away", type: "ft" | "fg2" | "fg3") {
    return recordRaw(side === "home" ? home.id : away.id, null, type, { made: true });
  }

  function startTimeout(side: "home" | "away") {
    if (timeouts[side] <= 0) return setBanner("Тайм-ауты этой команды закончились");
    setTimeouts((t) => ({ ...t, [side]: t[side] - 1 }));
    setClockRunning(false);
    setActiveTimeout({ side, left: 90 });
  }

  async function retryLast() {
    if (!retry) return;
    setSaving(true);
    const { error } = await supabase.rpc("apply_match_event", retry);
    setSaving(false);
    if (error) {
      setConn("error");
      return setBanner("Повтор не удался. Проверьте соединение.");
    }
    setConn("ok");
    setRetry(null);
    setBanner(null);
    await refetchEvents();
  }

  async function undo() {
    setSaving(true);
    await supabase.rpc("undo_last_event", { p_match_id: matchId });
    setSaving(false);
    await refetchEvents();
  }

  async function voidEvent(eventId: string) {
    const reason = prompt("Причина отмены события?");
    if (!reason) return;
    setSaving(true);
    const { error } = await supabase.rpc("void_match_event", {
      p_event_id: eventId,
      p_reason: reason,
    });
    setSaving(false);
    if (error) return setBanner(error.message);
    await refetchEvents();
  }

  async function submit() {
    if (!confirm("Отправить результат на подтверждение администратору?")) return;
    setSaving(true);
    const { error } = await supabase.rpc("submit_match_result", {
      p_match_id: matchId,
      p_went_overtime: false,
    });
    setSaving(false);
    if (error) return setBanner(error.message);
    setStatus("pending_confirmation");
    setBanner("Результат отправлен на подтверждение.");
    router.refresh();
  }

  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.name ?? "—" : "—";

  const renderTeamPanel = (side: "home" | "away") => {
    const team = side === "home" ? home : away;
    const value = side === "home" ? score.home : score.away;
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
          <span className="max-w-[9rem] truncate">{team.short}</span>
        </div>
        <div className="text-4xl font-black leading-none tabular-nums">{value}</div>
        <div className="flex gap-1">
          {(["ft", "fg2", "fg3"] as const).map((t, i) => (
            <button
              key={t}
              data-tap
              disabled={!isLive || saving}
              onClick={() => teamScore(side, t)}
              className="min-w-9 rounded-lg bg-accent px-2.5 py-1.5 text-sm font-bold text-accent-fg active:scale-95 disabled:opacity-40"
            >
              +{i + 1}
            </button>
          ))}
        </div>
        <button
          data-tap
          disabled={!isLive || timeouts[side] <= 0}
          onClick={() => startTimeout(side)}
          className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-40"
        >
          Тайм-аут · {timeouts[side]}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div className="sticky top-14 z-20 space-y-3 rounded-2xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{isLive ? <LiveBadge /> : <Badge variant="muted">{status}</Badge>}</span>
          <span>Четверть {period}</span>
        </div>

        {/* Game clock */}
        <div className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-2/60 py-2">
          <div className="text-3xl font-black tabular-nums">{mmss(clock)}</div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setQuarterSec((q) => Math.max(60, q - 60))}
              className="h-7 w-7 rounded-lg border border-border text-sm disabled:opacity-40"
              disabled={clockRunning}
              title="−1 мин к длине четверти"
            >−</button>
            <Button size="sm" variant={clockRunning ? "outline" : "primary"} onClick={() => setClockRunning((r) => !r)}>
              {clockRunning ? "Пауза" : "Старт"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setClock(quarterSec); setClockRunning(false); }}>
              Сброс
            </Button>
            <button
              onClick={() => setQuarterSec((q) => Math.min(1800, q + 60))}
              className="h-7 w-7 rounded-lg border border-border text-sm disabled:opacity-40"
              disabled={clockRunning}
              title="+1 мин к длине четверти"
            >+</button>
          </div>
          <span className="text-[11px] text-muted">Четверть: {mmss(quarterSec)}</span>
        </div>

        {/* Scores + team quick buttons + timeouts */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          {renderTeamPanel("home")}
          <span className="self-center pt-6 text-muted">:</span>
          {renderTeamPanel("away")}
        </div>

        {/* Active timeout overlay */}
        {activeTimeout && (
          <div className="flex items-center justify-between rounded-xl bg-live/10 px-3 py-2">
            <span className="text-sm font-semibold text-live">
              Тайм-аут · {(activeTimeout.side === "home" ? home : away).short} · {mmss(activeTimeout.left)}
            </span>
            <Button size="sm" variant="danger" onClick={() => setActiveTimeout(null)}>Завершить</Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {status === "scheduled" && (
            <Button size="sm" onClick={startMatch} disabled={saving}>Начать матч</Button>
          )}
          {isLive && (
            <>
              <Button size="sm" variant="secondary" onClick={nextPeriod} disabled={saving}>
                Следующая четверть
              </Button>
              <Button size="sm" variant="outline" onClick={undo} disabled={saving}>
                Отменить последнее
              </Button>
              <Button size="sm" variant="primary" onClick={submit} disabled={saving}>
                Завершить и отправить
              </Button>
            </>
          )}
        </div>
      </div>

      {conn === "error" && (
        <FormBanner kind="error">
          <div className="flex items-center justify-between gap-2">
            <span>{banner}</span>
            <Button size="sm" variant="danger" onClick={retryLast}>Повторить</Button>
          </div>
        </FormBanner>
      )}
      {conn === "ok" && banner && <FormBanner kind="info">{banner}</FormBanner>}

      {/* Player-level stats panel — only when individual stats are enabled.
          With stats off the operator scores per team from the scoreboard. */}
      {features.individualStats && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <PlayerColumn team={home} players={homePlayers} selected={selected} onSelect={setSelected} />
            <PlayerColumn team={away} players={awayPlayers} selected={selected} onSelect={setSelected} />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-3">
            <p className="mb-2 text-xs text-muted">
              {selected ? (
                <>Игрок: <strong className="text-foreground">№{selected.number} {selected.name}</strong></>
              ) : (
                "Выберите игрока, затем нажмите действие"
              )}
            </p>
            <div className="space-y-2">
              <Row label="Забито">
                <Act onClick={() => record("ft", { made: true })} disabled={!isLive || !selected}>+1</Act>
                <Act onClick={() => record("fg2", { made: true })} disabled={!isLive || !selected}>+2</Act>
                <Act onClick={() => record("fg3", { made: true })} disabled={!isLive || !selected}>+3</Act>
              </Row>
              <Row label="Мимо">
                <Act onClick={() => record("ft", { made: false })} disabled={!isLive || !selected}>штр</Act>
                <Act onClick={() => record("fg2", { made: false })} disabled={!isLive || !selected}>2о</Act>
                <Act onClick={() => record("fg3", { made: false })} disabled={!isLive || !selected}>3о</Act>
              </Row>
              <Row label="Подбор">
                <Act onClick={() => record("rebound", { rebound: "offensive" })} disabled={!isLive || !selected}>атак.</Act>
                <Act onClick={() => record("rebound", { rebound: "defensive" })} disabled={!isLive || !selected}>защ.</Act>
              </Row>
              <Row label="Прочее">
                <Act onClick={() => record("assist")} disabled={!isLive || !selected}>пас</Act>
                <Act onClick={() => record("steal")} disabled={!isLive || !selected}>перехват</Act>
                <Act onClick={() => record("block")} disabled={!isLive || !selected}>блок</Act>
                <Act onClick={() => record("turnover")} disabled={!isLive || !selected}>потеря</Act>
                <Act onClick={() => record("foul")} disabled={!isLive || !selected}>фол</Act>
              </Row>
            </div>
          </div>
        </>
      )}

      {/* Action history */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">История действий ({events.length})</h2>
        <div className="space-y-1">
          {[...events].reverse().slice(0, 30).map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg bg-surface-2/60 px-2 py-1.5 text-sm">
              <span>
                <span className="font-medium">{e.teamId === home.id ? home.short : away.short}</span>{" "}
                {labelOf(e)}{e.playerId ? ` · ${nameOf(e.playerId)}` : ""}
              </span>
              {isLive && (
                <button className="text-xs text-live hover:underline" onClick={() => voidEvent(e.id)}>
                  отменить
                </button>
              )}
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-muted">Событий пока нет.</p>}
        </div>
      </div>
    </div>
  );
}

function PlayerColumn({
  team,
  players,
  selected,
  onSelect,
}: {
  team: Team;
  players: ConsolePlayer[];
  selected: ConsolePlayer | null;
  onSelect: (p: ConsolePlayer) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-2">
      <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} />
        {team.short}
      </div>
      <div className="space-y-1">
        {players.map((p) => {
          const active = selected?.id === p.id;
          return (
            <button
              key={p.id}
              data-tap
              onClick={() => onSelect(p)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                active ? "bg-accent text-accent-fg" : "bg-surface-2/60"
              }`}
            >
              <span className="w-6 shrink-0 text-center font-bold tabular-nums">{p.number}</span>
              <span className="truncate">{p.name}</span>
            </button>
          );
        })}
        {players.length === 0 && <p className="px-2 py-1 text-xs text-muted">Нет игроков</p>}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Act({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      data-tap
      onClick={onClick}
      disabled={disabled}
      className="min-w-12 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
