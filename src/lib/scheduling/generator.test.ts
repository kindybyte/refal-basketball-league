import { describe, it, expect } from "vitest";
import {
  generateSchedule,
  roundRobinRounds,
  makeGroups,
  defaultGroupsCount,
  type ScheduleSettings,
  type TeamInput,
  type PlannedMatch,
} from "./generator";

function makeTeams(n: number): TeamInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}` }));
}

const baseSettings = (over: Partial<ScheduleSettings> = {}): ScheduleSettings => ({
  format: "round_robin",
  startDate: "2026-11-03",
  endDate: "2026-11-30",
  dailyStartTime: "18:00",
  dailyEndTime: "23:00",
  matchDurationMin: 80,
  breakBetweenMin: 15,
  minRestHours: 20,
  courts: 1,
  roundsPerOpponent: 1,
  thirdPlaceMatch: true,
  ...over,
});

/** No team is scheduled into two overlapping time slots. */
function assertNoTeamOverlap(matches: PlannedMatch[]) {
  const byTeam = new Map<string, string[]>();
  for (const m of matches) {
    for (const r of [m.home, m.away]) {
      if (r.kind === "team" && m.scheduledAt) {
        const arr = byTeam.get(r.teamId) ?? [];
        arr.push(m.scheduledAt);
        byTeam.set(r.teamId, arr);
      }
    }
  }
  for (const [, times] of byTeam) {
    const uniq = new Set(times);
    expect(uniq.size).toBe(times.length); // same team never at the same instant
  }
}

/** No court hosts two matches at the same instant. */
function assertNoCourtClash(matches: PlannedMatch[]) {
  const seen = new Set<string>();
  for (const m of matches) {
    if (!m.scheduledAt) continue;
    const key = `${m.scheduledAt}#${m.court}`;
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }
}

describe("roundRobinRounds", () => {
  it("every pair meets exactly once for even team count", () => {
    const rounds = roundRobinRounds(["a", "b", "c", "d"]);
    const pairs = rounds.flat().map(([x, y]) => [x, y].sort().join("-"));
    expect(pairs.length).toBe(6); // C(4,2)
    expect(new Set(pairs).size).toBe(6);
    expect(rounds.length).toBe(3); // n-1 rounds
  });

  it("handles odd team count (bye) — C(5,2)=10 matches", () => {
    const rounds = roundRobinRounds(["a", "b", "c", "d", "e"]);
    const pairs = rounds.flat();
    expect(pairs.length).toBe(10);
  });

  it("doubles matches when roundsPerOpponent=2", () => {
    const rounds = roundRobinRounds(["a", "b", "c", "d"], 2);
    expect(rounds.flat().length).toBe(12);
  });
});

describe("makeGroups", () => {
  it("splits 8 teams into 2 balanced groups of 4", () => {
    const groups = makeGroups(makeTeams(8), 2);
    expect(groups.length).toBe(2);
    expect(groups[0].teamIds.length).toBe(4);
    expect(groups[1].teamIds.length).toBe(4);
    // every team assigned once
    const all = groups.flatMap((g) => g.teamIds);
    expect(new Set(all).size).toBe(8);
  });

  it("defaultGroupsCount suggests 2 groups for 8 teams", () => {
    expect(defaultGroupsCount(8)).toBe(2);
    expect(defaultGroupsCount(4)).toBe(1);
  });
});

describe("generateSchedule — round robin", () => {
  it("produces a conflict-free calendar for 6 teams", () => {
    const res = generateSchedule(makeTeams(6), baseSettings());
    expect(res.errors).toEqual([]);
    expect(res.matches.length).toBe(15); // C(6,2)
    expect(res.matches.every((m) => m.scheduledAt !== null)).toBe(true);
    assertNoTeamOverlap(res.matches);
    assertNoCourtClash(res.matches);
  });

  it("respects minimum rest — a team never plays twice the same day with 20h rest", () => {
    const res = generateSchedule(makeTeams(4), baseSettings({ minRestHours: 20 }));
    const perTeamPerDay = new Map<string, Set<string>>();
    for (const m of res.matches) {
      const day = m.scheduledAt?.slice(0, 10);
      for (const r of [m.home, m.away]) {
        if (r.kind === "team" && day) {
          const set = perTeamPerDay.get(r.teamId) ?? new Set();
          expect(set.has(day)).toBe(false); // only one match per day per team
          set.add(day);
          perTeamPerDay.set(r.teamId, set);
        }
      }
    }
  });
});

describe("generateSchedule — groups + playoff", () => {
  it("8 teams → 2 groups, 12 group matches + semifinals + final + 3rd place", () => {
    const res = generateSchedule(
      makeTeams(8),
      baseSettings({ format: "groups_playoff" }),
    );
    expect(res.errors).toEqual([]);
    expect(res.groups.length).toBe(2);
    const groupMatches = res.matches.filter((m) => m.stage === "group");
    expect(groupMatches.length).toBe(12); // 2 groups × C(4,2)=6
    expect(res.matches.some((m) => m.stage === "semifinal")).toBe(true);
    expect(res.matches.some((m) => m.stage === "final")).toBe(true);
    expect(res.matches.some((m) => m.stage === "third_place")).toBe(true);
    assertNoCourtClash(res.matches);
  });

  it("playoff matches are scheduled after the group stage", () => {
    const res = generateSchedule(makeTeams(8), baseSettings({ format: "groups_playoff" }));
    const lastGroup = Math.max(
      ...res.matches.filter((m) => m.stage === "group" && m.scheduledAt).map((m) => Date.parse(m.scheduledAt!)),
    );
    const firstPlayoff = Math.min(
      ...res.matches
        .filter((m) => m.stage !== "group" && m.scheduledAt)
        .map((m) => Date.parse(m.scheduledAt!)),
    );
    expect(firstPlayoff).toBeGreaterThan(lastGroup);
  });
});

describe("generateSchedule — single elimination", () => {
  it("8 teams → quarterfinals, semifinals, final", () => {
    const res = generateSchedule(makeTeams(8), baseSettings({ format: "single_elimination" }));
    expect(res.matches.filter((m) => m.stage === "quarterfinal").length).toBe(4);
    expect(res.matches.filter((m) => m.stage === "semifinal").length).toBe(2);
    expect(res.matches.filter((m) => m.stage === "final").length).toBe(1);
  });
});

describe("generateSchedule — fit check", () => {
  it("reports an error when the calendar cannot fit the allowed days", () => {
    const res = generateSchedule(
      makeTeams(10),
      baseSettings({
        format: "round_robin",
        startDate: "2026-11-03",
        endDate: "2026-11-04", // only 2 days
        dailyStartTime: "18:00",
        dailyEndTime: "20:00", // ~1 match slot per day on one court
        courts: 1,
      }),
    );
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
