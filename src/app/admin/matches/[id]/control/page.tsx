import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMatchController } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { OperatorConsole, type ConsolePlayer, type ConsoleEvent } from "./operator-console";

export const metadata = { title: "Ведение матча" };

export default async function MatchControlPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireMatchController(id, `/admin/matches/${id}/control`);

  const supabase = await createClient();
  const { data: match } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, status, tournament_id")
    .eq("id", id)
    .maybeSingle();

  if (!match) notFound();

  // Teams may still be placeholders (playoff match awaiting feeders, or a team
  // not yet assigned). Explain it instead of a bare 404.
  if (!match.home_team_id || !match.away_team_id) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="space-y-3 p-6 text-center text-sm">
          <h1 className="text-lg font-bold">Участники ещё не определены</h1>
          <p className="text-muted">
            Вести этот матч нельзя, пока обе команды не известны. Для матчей
            плей-офф участники подставляются автоматически после подтверждения
            результатов предыдущих стадий. Для группового матча назначьте команды
            в настройках или дождитесь публикации расписания.
          </p>
          <Link href="/admin/matches" className="text-accent underline">
            ← К списку матчей
          </Link>
        </CardContent>
      </Card>
    );
  }

  const teamIds = [match.home_team_id, match.away_team_id];
  const [{ data: teams }, { data: players }, { data: events }, { data: periods }] =
    await Promise.all([
      supabase.from("teams").select("id, name, short_name, color").in("id", teamIds),
      supabase
        .from("players")
        .select("id, first_name, last_name, jersey_number, team_id")
        .in("team_id", teamIds)
        .eq("status", "active")
        .order("jersey_number"),
      supabase
        .from("match_events")
        .select("id, team_id, player_id, event_type, made, points, created_at")
        .eq("match_id", id)
        .eq("voided", false)
        .order("created_at", { ascending: true }),
      supabase
        .from("match_periods")
        .select("period_number, status")
        .eq("match_id", id)
        .order("period_number", { ascending: false }),
    ]);

  const teamMap = new Map((teams ?? []).map((t) => [t.id, t]));
  const home = teamMap.get(match.home_team_id)!;
  const away = teamMap.get(match.away_team_id)!;

  const consolePlayers: ConsolePlayer[] = (players ?? []).map((p) => ({
    id: p.id,
    teamId: p.team_id,
    number: p.jersey_number,
    name: `${p.first_name} ${p.last_name}`,
  }));

  const consoleEvents: ConsoleEvent[] = (events ?? []).map((e) => ({
    id: e.id,
    teamId: e.team_id,
    playerId: e.player_id,
    type: e.event_type,
    made: e.made,
    points: e.points,
  }));

  const activePeriod =
    (periods ?? []).find((p) => p.status === "active")?.period_number ??
    (periods ?? [])[0]?.period_number ??
    1;

  return (
    <OperatorConsole
      matchId={match.id}
      status={match.status}
      home={{ id: home.id, short: home.short_name, name: home.name, color: home.color }}
      away={{ id: away.id, short: away.short_name, name: away.name, color: away.color }}
      players={consolePlayers}
      initialEvents={consoleEvents}
      initialPeriod={activePeriod}
    />
  );
}
