import Link from "next/link";
import { requireAdmin } from "@/lib/guards";
import { getActiveTournament } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/site/setup-notice";
import { ScheduleManager } from "./schedule-manager";

export const metadata = { title: "Расписание" };

export default async function AdminSchedulePage() {
  await requireAdmin();
  const tournament = await getActiveTournament();
  if (!tournament) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Расписание</h1>
        <EmptyState>
          Сначала{" "}
          <Link href="/admin/settings" className="text-accent underline">
            создайте турнир
          </Link>{" "}
          и добавьте команды.
        </EmptyState>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ count: matchCount }, { count: teamCount }] = await Promise.all([
    supabase.from("matches").select("*", { count: "exact", head: true }).eq("tournament_id", tournament.id),
    supabase.from("teams").select("*", { count: "exact", head: true }).eq("tournament_id", tournament.id).eq("status", "active"),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Генератор расписания</h1>
      <ScheduleManager
        alreadyPublished={(matchCount ?? 0) > 0}
        teamCount={teamCount ?? 0}
      />
    </div>
  );
}
