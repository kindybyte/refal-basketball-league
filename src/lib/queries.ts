import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type {
  PublicTournament,
  PublicMatch,
  PublicStanding,
  PublicPlayerStats,
  PublicTeam,
  PublicPlayer,
  PublicBracketSlot,
} from "@/lib/db-types";

/**
 * All reads go through the consent-aware `public_*` views (migration 0003).
 * When Supabase is not configured yet, every helper degrades to empty data so
 * the UI can show a friendly setup notice instead of crashing.
 */

export async function getActiveTournament(): Promise<PublicTournament | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_tournaments")
    .select("*")
    .order("status", { ascending: true });
  if (!data || data.length === 0) return null;
  // Prefer an ongoing tournament, then upcoming, else the first available.
  return (
    data.find((t) => t.status === "ongoing") ??
    data.find((t) => t.status === "upcoming") ??
    data[0]
  );
}

export async function getMatches(
  tournamentId: string,
  opts: { statuses?: string[]; limit?: number; ascending?: boolean } = {},
): Promise<PublicMatch[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  let q = supabase
    .from("public_matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("scheduled_at", { ascending: opts.ascending ?? true });
  if (opts.statuses) q = q.in("status", opts.statuses);
  if (opts.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return data ?? [];
}

export async function getLiveMatches(tournamentId: string) {
  return getMatches(tournamentId, { statuses: ["live"] });
}

export async function getUpcomingMatches(tournamentId: string, limit = 5) {
  return getMatches(tournamentId, {
    statuses: ["scheduled"],
    limit,
    ascending: true,
  });
}

export async function getRecentResults(tournamentId: string, limit = 5) {
  const all = await getMatches(tournamentId, {
    statuses: ["completed"],
    ascending: false,
  });
  return all.slice(0, limit);
}

export async function getStandings(
  tournamentId: string,
): Promise<PublicStanding[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_standings")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("rank", { ascending: true });
  return data ?? [];
}

export async function getPlayerStats(
  tournamentId: string,
): Promise<PublicPlayerStats[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_player_stats")
    .select("*")
    .eq("tournament_id", tournamentId);
  return data ?? [];
}

export async function getTeams(tournamentId: string): Promise<PublicTeam[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_teams")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("name", { ascending: true });
  return data ?? [];
}

export async function getTeam(teamId: string): Promise<PublicTeam | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_teams")
    .select("*")
    .eq("id", teamId)
    .maybeSingle();
  return data ?? null;
}

export async function getTeamPlayers(teamId: string): Promise<PublicPlayer[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_players")
    .select("*")
    .eq("team_id", teamId)
    .order("jersey_number", { ascending: true });
  return data ?? [];
}

export async function getMatch(matchId: string): Promise<PublicMatch | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  return data ?? null;
}

export async function getMatchEvents(matchId: string) {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_match_events")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function getPlayer(playerId: string): Promise<PublicPlayer | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_players")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();
  return data ?? null;
}

export async function getPlayerStatsOne(
  playerId: string,
): Promise<PublicPlayerStats | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_player_stats")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();
  return data ?? null;
}

export async function getTeamMatches(
  tournamentId: string,
  teamId: string,
): Promise<PublicMatch[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order("scheduled_at");
  return data ?? [];
}

export async function getBracket(
  tournamentId: string,
): Promise<PublicBracketSlot[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_bracket")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("slot_index", { ascending: true });
  return data ?? [];
}
