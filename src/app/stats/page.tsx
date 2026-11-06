import type { Metadata } from "next";
import Link from "next/link";
import { getActiveTournament, getPlayerStats } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { features } from "@/lib/features";
import { computeAverages } from "@/lib/stats";
import type { PublicPlayerStats, PlayerAverages } from "@/lib/db-types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SetupNotice, EmptyState } from "@/components/site/setup-notice";

export const metadata: Metadata = { title: "Статистика и лидеры" };

type Row = { s: PublicPlayerStats; avg: PlayerAverages };

const categories: { key: keyof PlayerAverages; title: string; unit: string }[] = [
  { key: "ppg", title: "Очки", unit: "очк" },
  { key: "rpg", title: "Подборы", unit: "подб" },
  { key: "apg", title: "Передачи", unit: "пер" },
  { key: "spg", title: "Перехваты", unit: "пхв" },
  { key: "bpg", title: "Блок-шоты", unit: "блк" },
];

export default async function StatsPage() {
  if (!features.individualStats) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Статистика и лидеры</h1>
        <EmptyState>Раздел индивидуальной статистики временно недоступен.</EmptyState>
      </div>
    );
  }
  if (!isSupabaseConfigured) return <SetupNotice />;
  const tournament = await getActiveTournament();
  if (!tournament) return <EmptyState>Турнир ещё не создан.</EmptyState>;

  const minGames = tournament.min_games_for_leaders ?? 1;
  const stats = await getPlayerStats(tournament.id);
  const rows: Row[] = stats
    .map((s) => ({ s, avg: computeAverages(s) }))
    .filter((r) => r.s.games_played >= minGames);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Статистика и лидеры</h1>

      {rows.length === 0 ? (
        <EmptyState>
          Лидеры отображаются только для игроков, разрешивших публикацию
          индивидуальной статистики, при минимуме {minGames} сыгранных матчей.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {categories.map((c) => {
            const top = [...rows]
              .filter((r) => (r.avg[c.key] as number) > 0)
              .sort((a, b) => (b.avg[c.key] as number) - (a.avg[c.key] as number))
              .slice(0, 8);
            if (top.length === 0) return null;
            return (
              <Card key={c.key}>
                <CardContent className="p-3">
                  <h2 className="mb-2 text-sm font-bold">{c.title}</h2>
                  <ol className="space-y-1">
                    {top.map((r, i) => (
                      <li key={r.s.player_id} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm odd:bg-surface-2/40">
                        <Link href={`/players/${r.s.player_id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                          <span className="w-4 text-center text-xs text-muted">{i + 1}</span>
                          <span className="truncate">{r.s.display_name}</span>
                          {!r.s.name_is_public && <Badge variant="outline">псевд.</Badge>}
                        </Link>
                        <span className="shrink-0 tabular-nums">
                          <strong>{r.avg[c.key] as number}</strong>{" "}
                          <span className="text-xs text-muted">{c.unit}/игра</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted">
        Минимум матчей для попадания в рейтинг: {minGames}. Показатели без
        исходных событий не рассчитываются.
      </p>
    </div>
  );
}
