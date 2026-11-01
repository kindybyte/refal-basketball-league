import type { Metadata } from "next";
import { getActiveTournament, getMatches } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { MatchCard } from "@/components/match/match-card";
import { SetupNotice, EmptyState } from "@/components/site/setup-notice";
import { formatDate, formatWeekday } from "@/lib/format";

export const metadata: Metadata = { title: "Расписание" };

export default async function SchedulePage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const tournament = await getActiveTournament();
  if (!tournament) return <EmptyState>Турнир ещё не создан.</EmptyState>;

  const matches = await getMatches(tournament.id, { ascending: true });
  if (matches.length === 0)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Расписание</h1>
        <EmptyState>Расписание ещё не опубликовано.</EmptyState>
      </div>
    );

  // Group by day; matches without a date go into a separate bucket.
  const byDay = new Map<string, typeof matches>();
  const undated: typeof matches = [];
  for (const m of matches) {
    if (!m.scheduled_at) {
      undated.push(m);
      continue;
    }
    const day = m.scheduled_at.slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push(m);
    byDay.set(day, arr);
  }
  const days = [...byDay.keys()].sort();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Расписание</h1>

      {days.map((day) => (
        <section key={day} className="space-y-2">
          <h2 className="flex items-baseline gap-2 text-sm font-semibold">
            <span className="capitalize">{formatWeekday(day + "T00:00:00")}</span>
            <span className="text-muted">{formatDate(day + "T00:00:00")}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {byDay.get(day)!.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}

      {undated.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">Дата уточняется</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {undated.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
