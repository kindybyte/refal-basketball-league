import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  getActiveTournament,
  getUpcomingMatches,
  getLiveMatches,
  getRecentResults,
  getStandings,
  getPlayerStats,
} from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
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
    getPlayerStats(tournament.id),
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
                <TeamBig label={nextMatch.home_label} color={nextMatch.home_color} />
                <span className="text-sm font-semibold text-muted">—</span>
                <TeamBig label={nextMatch.away_label} color={nextMatch.away_color} align="right" />
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
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-black tracking-tight sm:text-2xl">{title}</h1>
        {isDemo && <DemoBadge />}
        {status && <Badge variant="accent">{statusLabel(status)}</Badge>}
      </div>
      {venue && <p className="text-sm text-muted">{venue}</p>}
      {dates && <p className="text-sm text-muted">{dates}</p>}
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
  label,
  color,
  align = "left",
}: {
  label: string;
  color: string | null;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center gap-2 ${
        align === "right" ? "sm:items-center" : "sm:items-center"
      }`}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-black text-white"
        style={{ backgroundColor: color ?? "var(--color-muted)" }}
      >
        {label.slice(0, 2).toUpperCase()}
      </span>
      <span className="text-center text-sm font-semibold">{label}</span>
    </div>
  );
}
