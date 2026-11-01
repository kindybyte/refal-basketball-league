import type { Metadata } from "next";
import { getActiveTournament, getMatches } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { MatchCard } from "@/components/match/match-card";
import { SetupNotice, EmptyState } from "@/components/site/setup-notice";
import { stageLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Плей-офф" };

const order = ["quarterfinal", "semifinal", "final", "third_place"];

export default async function BracketPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const tournament = await getActiveTournament();
  if (!tournament) return <EmptyState>Турнир ещё не создан.</EmptyState>;

  const all = await getMatches(tournament.id, { ascending: true });
  const playoff = all.filter((m) => order.includes(m.stage));

  if (playoff.length === 0)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Сетка плей-офф</h1>
        <EmptyState>Плей-офф ещё не сформирован.</EmptyState>
      </div>
    );

  const byStage = new Map<string, typeof playoff>();
  for (const m of playoff) {
    const arr = byStage.get(m.stage) ?? [];
    arr.push(m);
    byStage.set(m.stage, arr);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Сетка плей-офф</h1>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {order
          .filter((st) => byStage.has(st))
          .map((st) => (
            <section key={st} className="min-w-[260px] flex-1 space-y-2">
              <h2 className="text-sm font-semibold">{stageLabel(st)}</h2>
              <div className="space-y-3">
                {byStage.get(st)!.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          ))}
      </div>
      <p className="text-xs text-muted">
        Участники полуфиналов и финала подставляются автоматически после
        подтверждения результатов предыдущих матчей.
      </p>
    </div>
  );
}
