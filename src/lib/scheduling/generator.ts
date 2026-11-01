/**
 * Tournament schedule generator (spec §7) — a PURE, deterministic module so it
 * can be unit-tested without a database or clock. The caller supplies all dates.
 *
 * Supported formats: round_robin, groups_playoff, single_elimination.
 *
 * Guarantees enforced by the time scheduler:
 *   • a team never plays two matches at once;
 *   • a court never hosts two matches at once;
 *   • minimum rest between a team's matches is respected;
 *   • playoff matches are placed after the group/round-robin stage;
 *   • if everything cannot fit into the allowed days, a concrete error is
 *     returned instead of an invalid calendar.
 */

export type ScheduleFormat =
  | "round_robin"
  | "groups_playoff"
  | "single_elimination"
  | "league_playoff";

export interface TeamInput {
  id: string;
  name: string;
}

export interface ScheduleSettings {
  format: ScheduleFormat;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  playingDays?: string[]; // explicit YYYY-MM-DD; empty ⇒ every day in range
  dailyStartTime: string; // HH:MM
  dailyEndTime: string; // HH:MM
  matchDurationMin: number;
  breakBetweenMin: number;
  minRestHours: number;
  courts: number;
  roundsPerOpponent?: number; // round_robin / group stage, default 1
  thirdPlaceMatch?: boolean;
  groupsCount?: number; // groups_playoff; default derived from team count
}

/** A reference to a participant: a concrete team, or a bracket placeholder. */
export type Ref =
  | { kind: "team"; teamId: string }
  | { kind: "slot"; slotKey: string; label: string };

export interface PlannedMatch {
  key: string;
  stage: "round_robin" | "group" | "quarterfinal" | "semifinal" | "final" | "third_place";
  groupIndex: number | null;
  round: number;
  home: Ref;
  away: Ref;
  scheduledAt: string | null; // YYYY-MM-DDTHH:MM:00
  court: number;
}

export interface BracketSlotPlan {
  key: string;
  stage: PlannedMatch["stage"];
  slotIndex: number;
  label: string;
  /** When set, this slot is resolved from a match result (winner/loser). */
  sourceMatchKey?: string;
  takesWinner?: boolean;
  /** When set, this slot resolves to the team at this rank in the league table. */
  seedRank?: number;
}

export interface GroupPlan {
  index: number;
  name: string;
  teamIds: string[];
}

export interface ScheduleResult {
  groups: GroupPlan[];
  matches: PlannedMatch[];
  slots: BracketSlotPlan[];
  warnings: string[];
  errors: string[];
}

const BYE = "__BYE__";

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Inclusive list of YYYY-MM-DD between start and end (UTC-safe). */
function enumerateDays(start: string, end: string, explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) return [...explicit].sort();
  const days: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

/** Circle-method round-robin. Returns rounds; each round is a list of pairs so
 *  that every team plays at most once per round (helps rest distribution). */
export function roundRobinRounds(
  teamIds: string[],
  roundsPerOpponent = 1,
): Array<Array<[string, string]>> {
  const teams = [...teamIds];
  if (teams.length < 2) return [];
  if (teams.length % 2 === 1) teams.push(BYE);
  const n = teams.length;
  const arr = teams.slice();
  const singleCycle: Array<Array<[string, string]>> = [];

  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== BYE && b !== BYE) pairs.push([a, b]);
    }
    singleCycle.push(pairs);
    // rotate everything except the first element
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop() as string);
    arr.splice(0, arr.length, fixed, ...rest);
  }

  const all: Array<Array<[string, string]>> = [];
  for (let k = 0; k < Math.max(1, roundsPerOpponent); k++) {
    for (const round of singleCycle) {
      // Swap home/away on the return leg for fairness.
      all.push(k % 2 === 0 ? round : round.map(([a, b]) => [b, a] as [string, string]));
    }
  }
  return all;
}

/** Snake distribution of teams into groups (balanced sizes). */
export function makeGroups(teams: TeamInput[], groupsCount: number): GroupPlan[] {
  const groups: GroupPlan[] = Array.from({ length: groupsCount }, (_, i) => ({
    index: i + 1,
    name: `Группа ${String.fromCharCode(65 + i)}`,
    teamIds: [],
  }));
  teams.forEach((t, i) => {
    const cycle = Math.floor(i / groupsCount);
    const pos = i % groupsCount;
    const g = cycle % 2 === 0 ? pos : groupsCount - 1 - pos; // snake
    groups[g].teamIds.push(t.id);
  });
  return groups;
}

interface Interval {
  start: number; // absolute minutes (dayIndex*1440 + minuteOfDay)
  end: number;
}

/** Greedy time-slot assignment with conflict + rest checks. Mutates matches in
 *  place (sets scheduledAt/court). Returns errors if something cannot fit. */
function assignTimes(
  matches: PlannedMatch[],
  settings: ScheduleSettings,
  notBeforeAbs = 0,
): { errors: string[]; lastEndAbs: number } {
  const errors: string[] = [];
  const days = enumerateDays(settings.startDate, settings.endDate, settings.playingDays);
  const dayStart = parseTime(settings.dailyStartTime);
  const dayEnd = parseTime(settings.dailyEndTime);
  const step = settings.matchDurationMin + settings.breakBetweenMin;
  const restMin = settings.minRestHours * 60;

  // Precompute all slots (day, time, court) in chronological order.
  interface Slot {
    dayIndex: number;
    date: string;
    minute: number;
    court: number;
    abs: number;
  }
  const slots: Slot[] = [];
  days.forEach((date, dayIndex) => {
    for (let t = dayStart; t + settings.matchDurationMin <= dayEnd; t += step) {
      for (let c = 1; c <= settings.courts; c++) {
        slots.push({ dayIndex, date, minute: t, court: c, abs: dayIndex * 1440 + t });
      }
    }
  });

  const usedSlot = new Set<string>(); // `${abs}:${court}`
  const teamIntervals = new Map<string, Interval[]>();
  let lastEndAbs = notBeforeAbs;

  const conflictsRest = (teamId: string, abs: number): boolean => {
    const ivs = teamIntervals.get(teamId);
    if (!ivs) return false;
    const end = abs + settings.matchDurationMin;
    for (const iv of ivs) {
      const overlap = abs < iv.end && iv.start < end;
      if (overlap) return true;
      const gap = abs >= iv.end ? abs - iv.end : iv.start - end;
      if (gap < restMin) return true;
    }
    return false;
  };

  for (const match of matches) {
    const teamRefs = [match.home, match.away].filter(
      (r): r is { kind: "team"; teamId: string } => r.kind === "team",
    );
    let placed = false;
    for (const slot of slots) {
      if (slot.abs < notBeforeAbs) continue;
      const slotKey = `${slot.abs}:${slot.court}`;
      if (usedSlot.has(slotKey)) continue;
      // court must be free at that absolute time regardless of court index key
      // (same abs+court already covered by usedSlot)
      let ok = true;
      for (const tr of teamRefs) {
        if (conflictsRest(tr.teamId, slot.abs)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      // Assign
      usedSlot.add(slotKey);
      match.scheduledAt = `${slot.date}T${pad(Math.floor(slot.minute / 60))}:${pad(slot.minute % 60)}:00`;
      match.court = slot.court;
      const end = slot.abs + settings.matchDurationMin;
      lastEndAbs = Math.max(lastEndAbs, end);
      for (const tr of teamRefs) {
        const ivs = teamIntervals.get(tr.teamId) ?? [];
        ivs.push({ start: slot.abs, end });
        teamIntervals.set(tr.teamId, ivs);
      }
      placed = true;
      break;
    }
    if (!placed) {
      errors.push(
        `Не удалось разместить матч (${refLabel(match.home)} — ${refLabel(match.away)}): не хватает слотов в заданных днях/времени с учётом отдыха.`,
      );
    }
  }
  return { errors, lastEndAbs };
}

function refLabel(r: Ref): string {
  return r.kind === "team" ? r.teamId : r.label;
}

/** Build a single-elimination bracket over an ordered seed list of Refs.
 *  Produces placeholder matches + slots that resolve from match winners. */
function buildElimination(
  seeds: Ref[],
  startStage: PlannedMatch["stage"],
  thirdPlace: boolean,
): { matches: PlannedMatch[]; slots: BracketSlotPlan[] } {
  const matches: PlannedMatch[] = [];
  const slots: BracketSlotPlan[] = [];
  const stageOrder: PlannedMatch["stage"][] = [
    "quarterfinal",
    "semifinal",
    "final",
  ];

  // Pad to a power of two with BYE refs.
  let size = 1;
  while (size < seeds.length) size *= 2;
  const padded: Ref[] = [...seeds];
  while (padded.length < size)
    padded.push({ kind: "slot", slotKey: `bye-${padded.length}`, label: "BYE" });

  // Determine which stage names to use based on rounds needed.
  const rounds = Math.log2(size);
  // Map round index → stage name, ending at 'final'.
  function stageFor(roundFromStart: number): PlannedMatch["stage"] {
    const remaining = rounds - roundFromStart; // matches until final
    if (remaining === 1) return "final";
    if (remaining === 2) return "semifinal";
    if (remaining === 3) return "quarterfinal";
    return startStage;
  }

  let current: Ref[] = padded;
  let roundIdx = 0;
  const semifinalKeys: string[] = [];

  while (current.length > 1) {
    const stage = stageFor(roundIdx);
    const next: Ref[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const matchKey = `${stage}-${roundIdx}-${i / 2 + 1}`;
      matches.push({
        key: matchKey,
        stage,
        groupIndex: null,
        round: roundIdx + 1,
        home: current[i],
        away: current[i + 1],
        scheduledAt: null,
        court: 1,
      });
      // Winner slot feeding the next round.
      const winSlotKey = `win-${matchKey}`;
      slots.push({
        key: winSlotKey,
        stage,
        slotIndex: i / 2 + 1,
        label: `Победитель ${matchTitle(stage, i / 2 + 1)}`,
        sourceMatchKey: matchKey,
        takesWinner: true,
      });
      next.push({ kind: "slot", slotKey: winSlotKey, label: `Победитель ${matchTitle(stage, i / 2 + 1)}` });
      if (stage === "semifinal") semifinalKeys.push(matchKey);
    }
    current = next;
    roundIdx++;
  }

  if (thirdPlace && semifinalKeys.length === 2) {
    const l1 = `lose-${semifinalKeys[0]}`;
    const l2 = `lose-${semifinalKeys[1]}`;
    slots.push({ key: l1, stage: "third_place", slotIndex: 1, label: "Проигравший ПФ-1", sourceMatchKey: semifinalKeys[0], takesWinner: false });
    slots.push({ key: l2, stage: "third_place", slotIndex: 2, label: "Проигравший ПФ-2", sourceMatchKey: semifinalKeys[1], takesWinner: false });
    matches.push({
      key: "third_place-1",
      stage: "third_place",
      groupIndex: null,
      round: 1,
      home: { kind: "slot", slotKey: l1, label: "Проигравший ПФ-1" },
      away: { kind: "slot", slotKey: l2, label: "Проигравший ПФ-2" },
      scheduledAt: null,
      court: 1,
    });
  }

  return { matches, slots };
}

function matchTitle(stage: PlannedMatch["stage"], index: number): string {
  const names: Record<string, string> = {
    quarterfinal: "ЧФ",
    semifinal: "ПФ",
    final: "финала",
    third_place: "матча за 3-е",
    group: "группы",
    round_robin: "тура",
  };
  return `${names[stage] ?? stage}-${index}`;
}

export function defaultGroupsCount(teamCount: number): number {
  if (teamCount <= 5) return 1;
  return Math.max(2, Math.round(teamCount / 4));
}

/**
 * Top-4 playoff seeded from the single league table: 1st vs 4th, 2nd vs 3rd,
 * then final and (optionally) a third-place game. Seed slots resolve from the
 * standings once the league stage is complete (see resolve_bracket in SQL).
 */
function buildLeaguePlayoff(thirdPlace: boolean): {
  matches: PlannedMatch[];
  slots: BracketSlotPlan[];
} {
  const slots: BracketSlotPlan[] = [];
  const seedRef = (rank: number): Ref => {
    const key = `seed-${rank}`;
    slots.push({ key, stage: "round_robin", slotIndex: rank, label: `${rank}-е место`, seedRank: rank });
    return { kind: "slot", slotKey: key, label: `${rank}-е место` };
  };

  // Semifinals: 1–4 and 2–3.
  const matches: PlannedMatch[] = [
    { key: "sf-1", stage: "semifinal", groupIndex: null, round: 1, home: seedRef(1), away: seedRef(4), scheduledAt: null, court: 1 },
    { key: "sf-2", stage: "semifinal", groupIndex: null, round: 1, home: seedRef(2), away: seedRef(3), scheduledAt: null, court: 1 },
  ];

  // Winner slots feed the final.
  slots.push({ key: "win-sf-1", stage: "semifinal", slotIndex: 1, label: "Победитель ПФ-1", sourceMatchKey: "sf-1", takesWinner: true });
  slots.push({ key: "win-sf-2", stage: "semifinal", slotIndex: 2, label: "Победитель ПФ-2", sourceMatchKey: "sf-2", takesWinner: true });
  matches.push({
    key: "final-1", stage: "final", groupIndex: null, round: 1,
    home: { kind: "slot", slotKey: "win-sf-1", label: "Победитель ПФ-1" },
    away: { kind: "slot", slotKey: "win-sf-2", label: "Победитель ПФ-2" },
    scheduledAt: null, court: 1,
  });

  if (thirdPlace) {
    slots.push({ key: "lose-sf-1", stage: "third_place", slotIndex: 1, label: "Проигравший ПФ-1", sourceMatchKey: "sf-1", takesWinner: false });
    slots.push({ key: "lose-sf-2", stage: "third_place", slotIndex: 2, label: "Проигравший ПФ-2", sourceMatchKey: "sf-2", takesWinner: false });
    matches.push({
      key: "third_place-1", stage: "third_place", groupIndex: null, round: 1,
      home: { kind: "slot", slotKey: "lose-sf-1", label: "Проигравший ПФ-1" },
      away: { kind: "slot", slotKey: "lose-sf-2", label: "Проигравший ПФ-2" },
      scheduledAt: null, court: 1,
    });
  }

  return { matches, slots };
}

export function generateSchedule(
  teams: TeamInput[],
  settings: ScheduleSettings,
): ScheduleResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const roundsPerOpponent = settings.roundsPerOpponent ?? 1;

  if (teams.length < 2) {
    return { groups: [], matches: [], slots: [], warnings, errors: ["Нужно минимум 2 команды."] };
  }

  let groups: GroupPlan[] = [];
  let stageMatches: PlannedMatch[] = [];
  let slots: BracketSlotPlan[] = [];
  let playoffMatches: PlannedMatch[] = [];

  if (settings.format === "round_robin") {
    const rounds = roundRobinRounds(teams.map((t) => t.id), roundsPerOpponent);
    rounds.forEach((round, ri) => {
      round.forEach(([a, b], mi) => {
        stageMatches.push({
          key: `rr-${ri + 1}-${mi + 1}`,
          stage: "round_robin",
          groupIndex: null,
          round: ri + 1,
          home: { kind: "team", teamId: a },
          away: { kind: "team", teamId: b },
          scheduledAt: null,
          court: 1,
        });
      });
    });
    if (teams.length % 2 === 1) {
      warnings.push("Нечётное число команд: в каждом туре одна команда отдыхает.");
    }
  } else if (settings.format === "league_playoff") {
    // Single round-robin (everyone plays everyone once) + top-4 playoff.
    const rounds = roundRobinRounds(teams.map((t) => t.id), 1);
    rounds.forEach((round, ri) => {
      round.forEach(([a, b], mi) => {
        stageMatches.push({
          key: `rr-${ri + 1}-${mi + 1}`,
          stage: "round_robin",
          groupIndex: null,
          round: ri + 1,
          home: { kind: "team", teamId: a },
          away: { kind: "team", teamId: b },
          scheduledAt: null,
          court: 1,
        });
      });
    });
    if (teams.length >= 4) {
      const pl = buildLeaguePlayoff(settings.thirdPlaceMatch ?? true);
      playoffMatches = pl.matches;
      slots = pl.slots;
    } else {
      warnings.push("Для плей-офф нужно минимум 4 команды — сыграна только лига.");
    }
    if (teams.length % 2 === 1) {
      warnings.push("Нечётное число команд: в каждом туре одна команда отдыхает.");
    }
  } else if (settings.format === "groups_playoff") {
    const gc = settings.groupsCount ?? defaultGroupsCount(teams.length);
    groups = makeGroups(teams, gc);
    groups.forEach((g) => {
      const rounds = roundRobinRounds(g.teamIds, roundsPerOpponent);
      rounds.forEach((round, ri) => {
        round.forEach(([a, b], mi) => {
          stageMatches.push({
            key: `g${g.index}-${ri + 1}-${mi + 1}`,
            stage: "group",
            groupIndex: g.index,
            round: ri + 1,
            home: { kind: "team", teamId: a },
            away: { kind: "team", teamId: b },
            scheduledAt: null,
            court: 1,
          });
        });
      });
    });

    // Qualifier slots: winner + runner-up of each group (resolved from standings
    // by the admin after the group stage; not auto-derived from a match).
    const qualifierSlots: BracketSlotPlan[] = [];
    // Qualifier slots use the 'group' stage so their (stage, slot_index) never
    // collides with the semifinal winner slots produced by the bracket builder.
    const winnerRef = (gi: number): Ref => {
      const key = `grp-${gi}-1`;
      qualifierSlots.push({ key, stage: "group", slotIndex: gi * 2 - 1, label: `Победитель группы ${String.fromCharCode(64 + gi)}` });
      return { kind: "slot", slotKey: key, label: `Победитель группы ${String.fromCharCode(64 + gi)}` };
    };
    const runnerRef = (gi: number): Ref => {
      const key = `grp-${gi}-2`;
      qualifierSlots.push({ key, stage: "group", slotIndex: gi * 2, label: `2-е место группы ${String.fromCharCode(64 + gi)}` });
      return { kind: "slot", slotKey: key, label: `2-е место группы ${String.fromCharCode(64 + gi)}` };
    };

    let seeds: Ref[];
    if (gc === 2) {
      // Classic cross-seed: A1–B2, B1–A2.
      seeds = [winnerRef(1), runnerRef(2), winnerRef(2), runnerRef(1)];
    } else {
      const winners = groups.map((g) => winnerRef(g.index));
      const runners = groups.map((g) => runnerRef(g.index)).reverse();
      seeds = [...winners, ...runners];
      warnings.push("Плей-офф для числа групп, отличного от 2, посевается упрощённо — проверьте сетку.");
    }

    const elim = buildElimination(seeds, "semifinal", settings.thirdPlaceMatch ?? true);
    playoffMatches = elim.matches;
    slots = [...qualifierSlots, ...elim.slots];
  } else {
    // single_elimination
    const seeds: Ref[] = teams.map((t) => ({ kind: "team", teamId: t.id }));
    const elim = buildElimination(seeds, "quarterfinal", settings.thirdPlaceMatch ?? false);
    playoffMatches = elim.matches;
    slots = elim.slots;
    if ((teams.length & (teams.length - 1)) !== 0) {
      warnings.push("Число команд не степень двойки: добавлены технические проходы (BYE).");
    }
  }

  // Time assignment: group/round-robin stage first, playoff afterwards.
  const stageRes = assignTimes(stageMatches, settings);
  errors.push(...stageRes.errors);
  const playoffRes = assignTimes(playoffMatches, settings, stageRes.lastEndAbs + 1);
  errors.push(...playoffRes.errors);

  const matches = [...stageMatches, ...playoffMatches];

  // Does the last match end within the allowed window?
  const days = enumerateDays(settings.startDate, settings.endDate, settings.playingDays);
  if (days.length === 0) errors.push("Не заданы игровые дни в указанном диапазоне.");

  return { groups, matches, slots, warnings, errors };
}
