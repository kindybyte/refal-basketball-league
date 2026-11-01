import type { Metadata } from "next";
import { getActiveTournament, getMatches } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { MatchCard } from "@/components/match/match-card";
import { LiveBadge } from "@/components/ui/badge";
import { SetupNotice, EmptyState } from "@/components/site/setup-notice";

export const metadata: Metadata = { title: "Матчи" };

export default async function MatchesPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const tournament = await getActiveTournament();
  if (!tournament) return <EmptyState>Турнир ещё не создан.</EmptyState>;

  const all = await getMatches(tournament.id, { ascending: true });
  const live = all.filter((m) => m.status === "live");
  const upcoming = all.filter((m) => m.status === "scheduled" || m.status === "postponed");
  const done = all
    .filter((m) => m.is_final || m.status === "pending_confirmation")
    .reverse();

  if (all.length === 0)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Матчи</h1>
        <EmptyState>Матчи ещё не опубликованы.</EmptyState>
      </div>
    );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Матчи</h1>

      {live.length > 0 && (
        <Section title="В прямом эфире" extra={<LiveBadge />} matches={live} />
      )}
      {upcoming.length > 0 && <Section title="Предстоящие" matches={upcoming} />}
      {done.length > 0 && <Section title="Сыгранные" matches={done} />}
    </div>
  );
}

function Section({
  title,
  matches,
  extra,
}: {
  title: string;
  matches: Awaited<ReturnType<typeof getMatches>>;
  extra?: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-base font-bold">
        {title}
        {extra}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </section>
  );
}
