/**
 * Hand-written TypeScript types for the PUBLIC views and key RPCs.
 *
 * These mirror migrations 0001–0003. When the Supabase project exists you can
 * additionally generate full types with:
 *   supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 */

export type TournamentStatus = "upcoming" | "ongoing" | "completed" | "archived";
export type TournamentFormat =
  | "round_robin"
  | "groups_playoff"
  | "single_elimination"
  | "league_playoff";
export type MatchStatus =
  | "scheduled"
  | "live"
  | "pending_confirmation"
  | "completed"
  | "postponed"
  | "cancelled";
export type MatchStage =
  | "round_robin"
  | "group"
  | "quarterfinal"
  | "semifinal"
  | "final"
  | "third_place";
export type MatchEventType =
  | "ft"
  | "fg2"
  | "fg3"
  | "rebound"
  | "assist"
  | "steal"
  | "block"
  | "turnover"
  | "foul";
export type ReboundKind = "offensive" | "defensive";
export type ConsentPurpose = "publish_name" | "publish_stats";
export type AppRole = "admin" | "operator";

export interface PublicTournament {
  id: string;
  name: string;
  venue: string;
  city: string;
  status: TournamentStatus;
  is_demo: boolean;
  format: TournamentFormat | null;
  start_date: string | null;
  end_date: string | null;
  third_place_match: boolean | null;
  min_games_for_leaders?: number | null;
  periods_per_game?: number | null;
}

export interface PublicTeam {
  id: string;
  tournament_id: string;
  group_id: string | null;
  name: string;
  short_name: string;
  color: string;
  logo_path: string | null;
  description: string | null;
  status: "active" | "withdrawn";
  is_demo: boolean;
  group_name: string | null;
}

export interface PublicPlayer {
  player_id: string;
  tournament_id: string;
  team_id: string | null;
  jersey_number: number;
  position: string | null;
  status: "active" | "inactive" | "withdrawn";
  is_demo: boolean;
  name_is_public: boolean;
  stats_is_public: boolean;
  display_name: string;
}

export interface PublicMatch {
  id: string;
  tournament_id: string;
  group_id: string | null;
  stage: MatchStage;
  round_number: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  scheduled_at: string | null;
  court_number: number;
  status: MatchStatus;
  is_demo: boolean;
  home_label: string;
  away_label: string;
  home_name: string | null;
  away_name: string | null;
  home_color: string | null;
  away_color: string | null;
  home_score: number | null;
  away_score: number | null;
  is_final: boolean;
  winner_team_id: string | null;
}

export interface PublicMatchEvent {
  id: string;
  match_id: string;
  team_id: string;
  event_type: MatchEventType;
  made: boolean | null;
  rebound_type: ReboundKind | null;
  points: number;
  period_id: string | null;
  period_number: number | null;
  created_at: string;
  player_label: string | null;
}

export interface PublicStanding {
  tournament_id: string;
  group_id: string | null;
  team_id: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  tournament_points: number;
  rank: number | null;
  team_name: string;
  short_name: string;
  color: string;
  group_name: string | null;
}

export interface PublicPlayerStats {
  player_id: string;
  tournament_id: string;
  team_id: string | null;
  display_name: string;
  name_is_public: boolean;
  games_played: number;
  total_points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fga: number;
  fgm: number;
  tpa: number;
  tpm: number;
  fta: number;
  ftm: number;
}

export interface PublicBracketSlot {
  slot_id: string;
  tournament_id: string;
  stage: MatchStage;
  slot_index: number;
  label: string;
  source_match_id: string | null;
  takes_winner: boolean;
  resolved_team_id: string | null;
  resolved_short_name: string | null;
  resolved_name: string | null;
  resolved_color: string | null;
}

/** Derived per-game averages computed from PublicPlayerStats. */
export interface PlayerAverages {
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  topg: number;
  fgPct: number | null;
  tpPct: number | null;
  ftPct: number | null;
}
