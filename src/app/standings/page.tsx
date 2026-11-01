import type { Metadata } from "next";
import { getActiveTournament, getStandings } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { StandingsTable } from "@/components/standings-table";
import { SetupNotice, EmptyState } from "@/components/site/setup-notice";
import type { PublicStanding } from "@/lib/db-types";

export const metadata: Metadata = { title: "Турнирная таблица" };

export default async function StandingsPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const tournament = await getActiveTournament();
  if (!tournament) return <EmptyState>Турнир ещё не создан.</EmptyState>;

  const rows = await getStandings(tournament.id);
  if (rows.length === 0)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Турнирная таблица</h1>
        <EmptyState>Таблица появится после первых подтверждённых результатов.</EmptyState>
      </div>
    );

  // Split by group when the tournament uses groups.
  const groups = new Map<string, PublicStanding[]>();
  for (const r of rows) {
    const key = r.group_name ?? "";
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const groupKeys = [...groups.keys()].sort();
  const hasGroups = groupKeys.some((k) => k !== "");

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Турнирная таблица</h1>
      {hasGroups ? (
        groupKeys.map((k) => (
          <section key={k} className="space-y-2">
            {k && <h2 className="text-sm font-semibold">{k}</h2>}
            <StandingsTable rows={groups.get(k)!} />
          </section>
        ))
      ) : (
        <StandingsTable rows={rows} />
      )}
      <p className="text-xs text-muted">
        О — турнирные очки, ± — разница заброшенных и пропущенных. При равенстве
        учитываются личные встречи и разница очков.
      </p>
    </div>
  );
}
