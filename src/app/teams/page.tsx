import type { Metadata } from "next";
import Link from "next/link";
import { getActiveTournament, getTeams } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { SetupNotice, EmptyState } from "@/components/site/setup-notice";

export const metadata: Metadata = { title: "Команды" };

export default async function TeamsPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const tournament = await getActiveTournament();
  if (!tournament) return <EmptyState>Турнир ещё не создан.</EmptyState>;

  const teams = await getTeams(tournament.id);
  if (teams.length === 0)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Команды</h1>
        <EmptyState>Команды ещё не добавлены.</EmptyState>
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Команды</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => (
          <Link key={t.id} href={`/teams/${t.id}`}>
            <Card className="transition-colors hover:border-accent">
              <CardContent className="flex items-center gap-3 p-4">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
                  style={{ backgroundColor: t.color }}
                >
                  {t.short_name.slice(0, 3)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{t.name}</span>
                    {t.is_demo && <DemoBadge />}
                  </div>
                  {t.group_name && <Badge variant="outline">{t.group_name}</Badge>}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
