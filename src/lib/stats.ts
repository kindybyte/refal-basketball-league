import type { PlayerAverages, PublicPlayerStats } from "@/lib/db-types";

/** Rounds to one decimal place; stats with no games played are 0. */
function perGame(total: number, games: number): number {
  if (games <= 0) return 0;
  return Math.round((total / games) * 10) / 10;
}

/** Shooting percentage, or null when there were no attempts (spec §10: do not
 * compute metrics without the underlying events). */
function pct(made: number, attempts: number): number | null {
  if (attempts <= 0) return null;
  return Math.round((made / attempts) * 1000) / 10;
}

export function computeAverages(s: PublicPlayerStats): PlayerAverages {
  return {
    ppg: perGame(s.total_points, s.games_played),
    rpg: perGame(s.rebounds, s.games_played),
    apg: perGame(s.assists, s.games_played),
    spg: perGame(s.steals, s.games_played),
    bpg: perGame(s.blocks, s.games_played),
    topg: perGame(s.turnovers, s.games_played),
    fgPct: pct(s.fgm, s.fga),
    tpPct: pct(s.tpm, s.tpa),
    ftPct: pct(s.ftm, s.fta),
  };
}

export function formatPct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}
