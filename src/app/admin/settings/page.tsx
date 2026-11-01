import { requireAdmin } from "@/lib/guards";
import { getActiveTournament } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Настройки" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const tournament = await getActiveTournament();

  let settings = null;
  if (tournament) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tournament_settings")
      .select("*")
      .eq("tournament_id", tournament.id)
      .maybeSingle();
    settings = data;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        {tournament ? "Настройки турнира" : "Создание турнира"}
      </h1>
      <SettingsForm
        tournament={
          tournament
            ? { name: tournament.name, status: tournament.status }
            : null
        }
        settings={settings}
      />
    </div>
  );
}
