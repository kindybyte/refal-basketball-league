import { describe, it, expect } from "vitest";
import { computeAverages, formatPct } from "./stats";
import type { PublicPlayerStats } from "./db-types";

function stats(over: Partial<PublicPlayerStats> = {}): PublicPlayerStats {
  return {
    player_id: "p1",
    tournament_id: "t1",
    team_id: "team1",
    display_name: "Игрок №7",
    name_is_public: false,
    games_played: 4,
    total_points: 48,
    rebounds: 20,
    assists: 12,
    steals: 8,
    blocks: 4,
    turnovers: 10,
    fga: 40,
    fgm: 20,
    tpa: 10,
    tpm: 4,
    fta: 12,
    ftm: 9,
    ...over,
  };
}

describe("computeAverages", () => {
  it("computes per-game averages rounded to one decimal", () => {
    const a = computeAverages(stats());
    expect(a.ppg).toBe(12); // 48/4
    expect(a.rpg).toBe(5); // 20/4
    expect(a.apg).toBe(3); // 12/4
    expect(a.spg).toBe(2); // 8/4
    expect(a.bpg).toBe(1); // 4/4
    expect(a.topg).toBe(2.5); // 10/4
  });

  it("computes shooting percentages", () => {
    const a = computeAverages(stats());
    expect(a.fgPct).toBe(50); // 20/40
    expect(a.tpPct).toBe(40); // 4/10
    expect(a.ftPct).toBe(75); // 9/12
  });

  it("returns null percentages when there are no attempts (no invented stats)", () => {
    const a = computeAverages(stats({ fga: 0, fgm: 0, tpa: 0, tpm: 0, fta: 0, ftm: 0 }));
    expect(a.fgPct).toBeNull();
    expect(a.tpPct).toBeNull();
    expect(a.ftPct).toBeNull();
  });

  it("returns zeros for a player with no games played", () => {
    const a = computeAverages(stats({ games_played: 0, total_points: 0, rebounds: 0 }));
    expect(a.ppg).toBe(0);
    expect(a.rpg).toBe(0);
  });

  it("rounds to one decimal place", () => {
    const a = computeAverages(stats({ games_played: 3, total_points: 40 }));
    expect(a.ppg).toBe(13.3); // 40/3 = 13.333…
  });
});

describe("formatPct", () => {
  it("renders an em dash for null", () => {
    expect(formatPct(null)).toBe("—");
  });
  it("renders one decimal with a percent sign", () => {
    expect(formatPct(50)).toBe("50.0%");
    expect(formatPct(33.3)).toBe("33.3%");
  });
});
