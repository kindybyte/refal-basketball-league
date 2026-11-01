import { requireAppUser } from "@/lib/guards";
import { getActiveTournament, getMatches } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/site/setup-notice";
import { MatchesManager } from "./matches-manager";
import { InProgress } from "@/components/admin/in-progress";

export const metadata = { title: "Матчи" };

export default async function AdminMatchesPage() {
  const user = await requireAppUser();

  // Operators get a focused list of only the matches assigned to them.
  if (user.role === "operator") {
    const supabase = await createClient();
    const { data: assigns } = await supabase
      .from("operator_assignments")
      .select("match_id")
      .eq("operator_user_id", user.id)
      .is("revoked_at", null);
    const ids = (assigns ?? []).map((a) => a.match_id);
    if (ids.length === 0) {
      return <InProgress title="Мои матчи" note="Вам пока не назначены матчи." />;
    }
    const { data: matches } = await supabase
      .from("public_matches")
      .select("*")
      .in("id", ids)
      .order("scheduled_at");
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Мои матчи</h1>
        <MatchesManager matches={matches ?? []} operators={[]} assignments={{}} isAdmin={false} />
      </div>
    );
  }

  const tournament = await getActiveTournament();
  if (!tournament) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Матчи</h1>
        <EmptyState>Сначала создайте турнир и опубликуйте расписание.</EmptyState>
      </div>
    );
  }

  const supabase = await createClient();
  const [matches, { data: operators }, { data: assigns }] = await Promise.all([
    getMatches(tournament.id, {}),
    supabase.from("app_users").select("id, full_name").eq("role", "operator").eq("status", "active"),
    supabase
      .from("operator_assignments")
      .select("match_id, operator_user_id")
      .is("revoked_at", null),
  ]);

  const opName = new Map((operators ?? []).map((o) => [o.id, o.full_name]));
  const assignments: Record<string, { id: string; name: string }> = {};
  for (const a of assigns ?? []) {
    assignments[a.match_id] = {
      id: a.operator_user_id,
      name: opName.get(a.operator_user_id) ?? "—",
    };
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Матчи</h1>
      <MatchesManager
        matches={matches}
        operators={operators ?? []}
        assignments={assignments}
        isAdmin
      />
    </div>
  );
}
