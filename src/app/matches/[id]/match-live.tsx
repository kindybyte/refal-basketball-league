"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { stageLabel, statusLabel, formatDateTime } from "@/lib/format";
import type { PublicMatch, PublicMatchEvent } from "@/lib/db-types";

const label: Record<string, string> = {
  "ft:true": "реализованный штрафной (+1)",
  "fg2:true": "двухочковый (+2)",
  "fg3:true": "трёхочковый (+3)",
  "ft:false": "промах штрафного",
  "fg2:false": "промах 2-очкового",
  "fg3:false": "промах 3-очкового",
  rebound: "подбор",
  assist: "передача",
  steal: "перехват",
  block: "блок-шот",
  turnover: "потеря",
  foul: "фол",
};
function evLabel(e: PublicMatchEvent): string {
  if (e.event_type === "ft" || e.event_type === "fg2" || e.event_type === "fg3")
    return label[`${e.event_type}:${e.made}`] ?? e.event_type;
  return label[e.event_type] ?? e.event_type;
}

export function MatchLiveView({
  matchId,
  initialMatch,
  initialEvents,
}: {
  matchId: string;
  initialMatch: PublicMatch;
  initialEvents: PublicMatchEvent[];
}) {
  const supabase = createClient();
  const [match, setMatch] = useState(initialMatch);
  const [events, setEvents] = useState(initialEvents);

  const isLive = match.status === "live";

  // Near-real-time via polling the public views (anon-safe under RLS). Only
  // active while the match is live, to keep it light.
  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    const tick = async () => {
      const [{ data: m }, { data: ev }] = await Promise.all([
        supabase.from("public_matches").select("*").eq("id", matchId).maybeSingle(),
        supabase
          .from("public_match_events")
          .select("*")
          .eq("match_id", matchId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;
      if (m) setMatch(m as PublicMatch);
      if (ev) setEvents(ev as PublicMatchEvent[]);
    };
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isLive, matchId, supabase]);

  const homeWin = match.is_final && match.winner_team_id === match.home_team_id;
  const awayWin = match.is_final && match.winner_team_id === match.away_team_id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{stageLabel(match.stage)}</span>
        {isLive ? <LiveBadge /> : <span>{formatDateTime(match.scheduled_at)}</span>}
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-3 items-center gap-2">
            <TeamSide label={match.home_label} color={match.home_color} win={homeWin} />
            <div className="text-center">
              <div className="text-4xl font-black tabular-nums">
                {match.home_score ?? "–"}
                <span className="mx-1 text-muted">:</span>
                {match.away_score ?? "–"}
              </div>
              <Badge variant={isLive ? "live" : "muted"} className="mt-1">
                {statusLabel(match.status)}
              </Badge>
            </div>
            <TeamSide label={match.away_label} color={match.away_color} win={awayWin} right />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-base font-bold">Ход матча</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">События появятся после начала матча.</p>
        ) : (
          <Card>
            <CardContent className="p-2">
              {events.map((e) => {
                const home = e.team_id === match.home_team_id;
                return (
                  <div key={e.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-surface-2/40">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: (home ? match.home_color : match.away_color) ?? "var(--color-muted)" }}
                    />
                    <span className="w-10 shrink-0 text-xs text-muted">
                      {e.period_number ? `${e.period_number}ч` : ""}
                    </span>
                    <span className="flex-1 truncate">
                      {e.player_label ? `${e.player_label} — ` : ""}
                      {evLabel(e)}
                    </span>
                    {e.points > 0 && <span className="font-bold tabular-nums">+{e.points}</span>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function TeamSide({
  label,
  color,
  win,
  right,
}: {
  label: string;
  color: string | null;
  win: boolean;
  right?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 ${right ? "order-last" : ""}`}>
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full text-base font-black text-white"
        style={{ backgroundColor: color ?? "var(--color-muted)" }}
      >
        {label.slice(0, 2).toUpperCase()}
      </span>
      <span className={`text-center text-sm ${win ? "font-bold" : "font-medium"}`}>{label}</span>
    </div>
  );
}
