import { createClient } from "@/lib/supabase/server";

export interface DashboardMetrics {
  teams: number;
  players: number;
  matchesPlayed: number;
  matchesUpcoming: number;
  liveMatches: number;
  openPrivacyRequests: number;
  pendingResults: number;
}

export async function getDashboardMetrics(
  tournamentId: string,
): Promise<DashboardMetrics> {
  const supabase = await createClient();

  const matchCount = async (status: string) => {
    const { count } = await supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .eq("status", status);
    return count ?? 0;
  };

  const [
    teamsRes,
    playersRes,
    privacyRes,
    matchesPlayed,
    matchesUpcoming,
    liveMatches,
    pendingResults,
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournamentId),
    supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournamentId),
    supabase
      .from("privacy_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
    matchCount("completed"),
    matchCount("scheduled"),
    matchCount("live"),
    matchCount("pending_confirmation"),
  ]);

  return {
    teams: teamsRes.count ?? 0,
    players: playersRes.count ?? 0,
    openPrivacyRequests: privacyRes.count ?? 0,
    matchesPlayed,
    matchesUpcoming,
    liveMatches,
    pendingResults,
  };
}
