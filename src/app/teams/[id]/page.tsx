import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTeam,
  getTeamPlayers,
  getTeamMatches,
  getStandings,
  getActiveTournament,
} from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { MatchCard } from "@/components/match/match-card";
import { SetupNotice } from "@/components/site/setup-notice";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const team = await getTeam(id);
  return { title: team?.name ?? "Команда" };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const { id } = await params;
  const team = await getTeam(id);
  if (!team) notFound();

  const [players, matches, tournament] = await Promise.all([
    getTeamPlayers(id),
    getActiveTournament().then((t) => (t ? getTeamMatches(t.id, id) : [])),
    getActiveTournament(),
  ]);
  const standings = tournament ? await getStandings(tournament.id) : [];
  const row = standings.find((s) => s.team_id === id);

  const upcoming = matches.filter((m) => !m.is_final && m.status !== "cancelled");
  const played = matches.filter((m) => m.is_final);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-black text-white"
          style={{ backgroundColor: team.color }}
        >
          {team.short_name.slice(0, 3)}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{team.name}</h1>
            {team.is_demo && <DemoBadge />}
          </div>
          {team.group_name && <Badge variant="outline">{team.group_name}</Badge>}
        </div>
      </div>

      {team.description && <p className="text-sm text-muted">{team.description}</p>}

      {row && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Место" value={row.rank ? `#${row.rank}` : "—"} />
          <Stat label="В / П" value={`${row.wins} / ${row.losses}`} />
          <Stat label="Забито / Пропущено" value={`${row.points_for} / ${row.points_against}`} />
          <Stat label="Очки" value={String(row.tournament_points)} />
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-bold">Состав ({players.length})</h2>
        <Card>
          <CardContent className="p-2">
            {players.length === 0 && <p className="p-2 text-sm text-muted">Состав не заполнен.</p>}
            {players.map((p) => (
              <Link
                key={p.player_id}
                href={`/players/${p.player_id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2"
              >
                <span className="w-7 text-center font-bold tabular-nums">{p.jersey_number}</span>
                <span className="flex-1 truncate text-sm">{p.display_name}</span>
                {!p.name_is_public && <Badge variant="outline">псевдоним</Badge>}
                {p.position && <span className="text-xs text-muted">{p.position}</span>}
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">Ближайшие матчи</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {played.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">Результаты</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {played.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-lg font-black tabular-nums">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </CardContent>
    </Card>
  );
}
