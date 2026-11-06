import { requireAdmin } from "@/lib/guards";
import { getActiveTournament } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { TeamsManager } from "./teams-manager";
import { EmptyState } from "@/components/site/setup-notice";

export const metadata = { title: "Команды" };

export default async function AdminTeamsPage() {
  await requireAdmin();
  const tournament = await getActiveTournament();
  if (!tournament) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Команды</h1>
        <EmptyState>Сначала создайте турнир в настройках.</EmptyState>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: teams }, { data: groups }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, short_name, color, group_id, description, logo_path")
      .eq("tournament_id", tournament.id)
      .order("name"),
    supabase
      .from("tournament_groups")
      .select("id, name")
      .eq("tournament_id", tournament.id)
      .order("group_index"),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Команды</h1>
      <TeamsManager teams={teams ?? []} groups={groups ?? []} />
    </div>
  );
}
