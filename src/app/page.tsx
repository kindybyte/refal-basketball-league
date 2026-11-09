import Link from "next/link";
import { ChevronRight, MapPin, CalendarDays } from "lucide-react";
import { TeamAvatar } from "@/components/team-avatar";
import {
  getActiveTournament,
  getUpcomingMatches,
  getLiveMatches,
  getRecentResults,
  getStandings,
  getPlayerStats,
} from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { features } from "@/lib/features";
import { computeAverages } from "@/lib/stats";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, LiveBadge, DemoBadge } from "@/components/ui/badge";
import { MatchCard } from "@/components/match/match-card";
import { Countdown } from "@/components/match/countdown";
import { SetupNotice, EmptyState } from "@/components/site/setup-notice";
import { formatDate, formatDateTime, statusLabel, stageLabel } from "@/lib/format";

export default async function HomePage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="space-y-4">
        <TournamentHeader title="REFAL Basketball League" />
        <SetupNotice />
      </div>
    );
  }

  const tournament = await getActiveTournament();
  if (!tournament) {
    return (
      <div className="space-y-4">
        <TournamentHeader title="REFAL Basketball League" />
        <EmptyState>
          Турнир ещё не создан. Администратор может создать его в панели
          управления.
        </EmptyState>
      </div>
    );
  }

  const [upcoming, live, recent, standings, playerStats] = await Promise.all([
    getUpcomingMatches(tournament.id, 4),
    getLiveMatches(tournament.id),
    getRecentResults(tournament.id, 4),
    getStandings(tournament.id),
    features.individualStats ? getPlayerStats(tournament.id) : Promise.resolve([]),
  ]);

  const nextMatch = upcoming[0];
  const topScorers = [...playerStats]
    .map((s) => ({ s, avg: computeAverages(s) }))
    .sort((a, b) => b.avg.ppg - a.avg.ppg)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <TournamentHeader
        title={tournament.name}
        venue={`${tournament.city}, ${tournament.venue}`}
        dates={datesLabel(tournament.start_date, tournament.end_date)}
        status={tournament.status}
        isDemo={tournament.is_demo}
      />

      {live.length > 0 && (
        <section className="space-y-2">
          <SectionTitle title="Матч в прямом эфире" extra={<LiveBadge />} />
          <div className="grid gap-3 sm:grid-cols-2">
            {live.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {nextMatch && (
        <section className="space-y-2">
          <SectionTitle title="Ближайший матч" />
          <Card className="overflow-hidden">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{stageLabel(nextMatch.stage)}</span>
                <span>{formatDateTime(nextMatch.scheduled_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <TeamBig name={nextMatch.home_name ?? nextMatch.home_label} short={nextMatch.home_label} color={nextMatch.home_color} logoPath={nextMatch.home_logo_path} />
                <span className="text-sm font-semibold text-muted">VS</span>
                <TeamBig name={nextMatch.away_name ?? nextMatch.away_label} short={nextMatch.away_label} color={nextMatch.away_color} logoPath={nextMatch.away_logo_path} />
              </div>
              {nextMatch.scheduled_at && (
                <div className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 py-3">
                  <span className="text-xs uppercase tracking-wide text-muted">
                    До начала
                  </span>
                  <span className="text-lg">
                    <Countdown iso={nextMatch.scheduled_at} />
                  </span>
                </div>
              )}
              <Link
                href={`/matches/${nextMatch.id}`}
                className="flex w-full items-center justify-center rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-fg"
                data-tap
              >
                Подробнее о матче
              </Link>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="space-y-2">
        <SectionTitle title="Последние результаты" href="/matches" />
        {recent.length === 0 ? (
          <EmptyState>Пока нет завершённых матчей.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle title="Турнирная таблица" href="/standings" />
        {standings.length === 0 ? (
          <EmptyState>Таблица появится после первых матчей.</EmptyState>
        ) : (
          <Card>
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Команда</th>
                    <th className="px-2 py-2 text-center font-medium">И</th>
                    <th className="px-2 py-2 text-center font-medium">В</th>
                    <th className="px-2 py-2 text-center font-medium">П</th>
                    <th className="px-2 py-2 text-center font-medium">±</th>
                    <th className="px-2 py-2 text-center font-medium">О</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.slice(0, 6).map((row) => (
                    <tr key={row.team_id} className="border-b border-border/60">
                      <td className="px-3 py-2 text-muted">{row.rank ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          {row.short_name}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.played}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.wins}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.losses}</td>
                      <td className="px-2 py-2 text-center tabular-nums">
                        {row.point_diff > 0 ? `+${row.point_diff}` : row.point_diff}
                      </td>
                      <td className="px-2 py-2 text-center font-semibold tabular-nums">
                        {row.tournament_points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {features.individualStats && (
      <section className="space-y-2">
        <SectionTitle title="Лидеры турнира" href="/stats" />
        {topScorers.length === 0 ? (
          <EmptyState>
            Статистика лидеров отображается только для игроков, разрешивших её
            публикацию.
          </EmptyState>
        ) : (
          <Card>
            <CardContent className="space-y-1 p-2">
              {topScorers.map(({ s, avg }, i) => (
                <div
                  key={s.player_id}
                  className="flex items-center justify-between rounded-lg px-2 py-2 odd:bg-surface-2/50"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-5 text-center text-sm text-muted">{i + 1}</span>
                    <span className="text-sm font-medium">{s.display_name}</span>
                    {!s.name_is_public && (
                      <Badge variant="outline">псевдоним</Badge>
                    )}
                  </span>
                  <span className="tabular-nums text-sm">
                    <span className="font-bold">{avg.ppg}</span>{" "}
                    <span className="text-muted">очк/игра</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
      )}
    </div>
  );
}

function datesLabel(start: string | null, end: string | null): string {
  if (!start && !end) return "Даты уточняются";
  return `${formatDate(start)} — ${formatDate(end)}`;
}

function TournamentHeader({
  title,
  venue,
  dates,
  status,
  isDemo,
}: {
  title: string;
  venue?: string;
  dates?: string;
  status?: string;
  isDemo?: boolean;
}) {
  return (
    <div className="hero-surface fade-in card-shadow -mx-4 -mt-4 mb-2 rounded-b-3xl border-b border-border px-4 pb-6 pt-6 sm:mx-0 sm:mt-0 sm:rounded-3xl sm:border">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {status && <Badge variant="accent">{statusLabel(status)}</Badge>}
        {isDemo && <DemoBadge />}
      </div>
      <h1 className="text-2xl font-black leading-tight tracking-tight sm:text-3xl">
        {title}
      </h1>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {venue && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-accent" /> {venue}
          </span>
        )}
        {dates && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-accent" /> {dates}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionTitle({
  title,
  href,
  extra,
}: {
  title: string;
  href?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
        {title}
        {extra}
      </h2>
      {href && (
        <Link
          href={href}
          className="flex items-center text-xs text-muted hover:text-foreground"
        >
          Все <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function TeamBig({
  name,
  short,
  color,
  logoPath,
}: {
  name: string;
  short: string;
  color: string | null;
  logoPath?: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <TeamAvatar short={short} name={name} color={color} logoPath={logoPath} size={56} />
      <span className="text-center text-sm font-semibold">{name}</span>
    </div>
  );
}
