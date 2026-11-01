import { requireAdmin } from "@/lib/guards";
import { getActiveTournament } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { PlayersManager, type PlayerRow } from "./players-manager";
import { EmptyState } from "@/components/site/setup-notice";

export const metadata = { title: "Игроки" };

export default async function AdminPlayersPage() {
  await requireAdmin();
  const tournament = await getActiveTournament();
  if (!tournament) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Игроки</h1>
        <EmptyState>Сначала создайте турнир в настройках.</EmptyState>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: players }, { data: teams }, { data: consents }, { data: contacts }] =
    await Promise.all([
      supabase
        .from("players")
        .select(
          "id, first_name, last_name, team_id, jersey_number, internal_code, position, public_alias, is_minor",
        )
        .eq("tournament_id", tournament.id)
        .order("jersey_number"),
      supabase
        .from("teams")
        .select("id, name, short_name")
        .eq("tournament_id", tournament.id)
        .order("name"),
      supabase
        .from("consent_records")
        .select("player_id, purpose")
        .eq("status", "granted")
        .is("revoked_at", null),
      supabase.from("private_player_contacts").select("player_id, phone, email, purpose_note"),
    ]);

  const consentSet = new Set(
    (consents ?? []).map((c) => `${c.player_id}:${c.purpose}`),
  );
  const contactMap = new Map(
    (contacts ?? []).map((c) => [c.player_id, c]),
  );

  const rows: PlayerRow[] = (players ?? []).map((p) => ({
    ...p,
    name_consent: consentSet.has(`${p.id}:publish_name`),
    stats_consent: consentSet.has(`${p.id}:publish_stats`),
    contacts: contactMap.get(p.id)
      ? {
          phone: contactMap.get(p.id)!.phone ?? "",
          email: contactMap.get(p.id)!.email ?? "",
          purpose_note: contactMap.get(p.id)!.purpose_note ?? "",
        }
      : null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Игроки</h1>
      <PlayersManager players={rows} teams={teams ?? []} />
    </div>
  );
}
