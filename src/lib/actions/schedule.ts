"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/guards";
import { getActiveTournament } from "@/lib/queries";
import {
  generateSchedule,
  type ScheduleSettings,
  type ScheduleResult,
  type Ref,
} from "@/lib/scheduling/generator";
import type { ActionResult } from "@/lib/actions/types";

export interface PreviewMatch {
  stage: string;
  groupName: string | null;
  round: number;
  homeLabel: string;
  awayLabel: string;
  scheduledAt: string | null;
  court: number;
}

export interface SchedulePreview {
  matches: PreviewMatch[];
  groups: { name: string; teamNames: string[] }[];
  warnings: string[];
  errors: string[];
}

async function loadInputs() {
  const supabase = await createClient();
  const tournament = await getActiveTournament();
  if (!tournament) return { error: "Турнир не найден" as const };

  const [{ data: settings }, { data: teams }] = await Promise.all([
    supabase.from("tournament_settings").select("*").eq("tournament_id", tournament.id).single(),
    supabase
      .from("teams")
      .select("id, name")
      .eq("tournament_id", tournament.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (!settings) return { error: "Нет настроек турнира" as const };
  if (!teams || teams.length < 2) return { error: "Нужно минимум 2 активные команды" as const };

  const sched: ScheduleSettings = {
    format: settings.format,
    startDate: settings.start_date,
    endDate: settings.end_date,
    playingDays: settings.playing_days ?? [],
    dailyStartTime: String(settings.daily_start_time).slice(0, 5),
    dailyEndTime: String(settings.daily_end_time).slice(0, 5),
    matchDurationMin: settings.match_duration_min,
    breakBetweenMin: settings.break_between_min,
    minRestHours: settings.min_rest_hours,
    courts: settings.courts_count,
    roundsPerOpponent: settings.rounds_per_opponent,
    thirdPlaceMatch: settings.third_place_match,
    weekdays: settings.game_weekdays ?? [],
    matchIntervalMin: settings.match_interval_min ?? 60,
  };

  return { tournamentId: tournament.id, settings: sched, teams, supabase };
}

function nameMap(teams: { id: string; name: string }[]) {
  return new Map(teams.map((t) => [t.id, t.name]));
}
function labelFor(ref: Ref, names: Map<string, string>): string {
  return ref.kind === "team" ? names.get(ref.teamId) ?? "?" : ref.label;
}

function toPreview(result: ScheduleResult, teams: { id: string; name: string }[]): SchedulePreview {
  const names = nameMap(teams);
  return {
    matches: result.matches.map((m) => ({
      stage: m.stage,
      groupName: m.groupIndex ? `Группа ${String.fromCharCode(64 + m.groupIndex)}` : null,
      round: m.round,
      homeLabel: labelFor(m.home, names),
      awayLabel: labelFor(m.away, names),
      scheduledAt: m.scheduledAt,
      court: m.court,
    })),
    groups: result.groups.map((g) => ({
      name: g.name,
      teamNames: g.teamIds.map((id) => names.get(id) ?? "?"),
    })),
    warnings: result.warnings,
    errors: result.errors,
  };
}

export async function previewScheduleAction(): Promise<
  ActionResult & { preview?: SchedulePreview }
> {
  await requireAdmin();
  const inputs = await loadInputs();
  if ("error" in inputs) return { ok: false, error: inputs.error };
  const result = generateSchedule(inputs.teams, inputs.settings);
  return { ok: true, preview: toPreview(result, inputs.teams) };
}

export async function publishScheduleAction(): Promise<ActionResult> {
  await requireAdmin();
  const inputs = await loadInputs();
  if ("error" in inputs) return { ok: false, error: inputs.error };
  const { tournamentId, settings, teams, supabase } = inputs;

  // Guard against overwriting a published calendar (no loss of played results).
  const { count: existing } = await supabase
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);
  if ((existing ?? 0) > 0) {
    return {
      ok: false,
      error:
        "Расписание уже существует. Повторная генерация отключена, чтобы не потерять сыгранные результаты. Удалите матчи вручную, если хотите пересоздать календарь.",
    };
  }

  const result = generateSchedule(teams, settings);
  if (result.errors.length > 0) {
    return { ok: false, error: result.errors[0] };
  }

  // 1. Groups
  const groupIdByIndex = new Map<number, string>();
  for (const g of result.groups) {
    const { data, error } = await supabase
      .from("tournament_groups")
      .insert({ tournament_id: tournamentId, name: g.name, group_index: g.index })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Группы: ${error.message}` };
    groupIdByIndex.set(g.index, data.id);
    // Assign teams to the group for standings grouping.
    await supabase.from("teams").update({ group_id: data.id }).in("id", g.teamIds);
  }

  // 2. Matches (team refs resolved; slot refs filled in step 4)
  const matchIdByKey = new Map<string, string>();
  const slotRefsByMatch = new Map<string, { home?: string; away?: string }>();
  for (const m of result.matches) {
    const homeTeam = m.home.kind === "team" ? m.home.teamId : null;
    const awayTeam = m.away.kind === "team" ? m.away.teamId : null;
    if (m.home.kind === "slot" || m.away.kind === "slot") {
      slotRefsByMatch.set(m.key, {
        home: m.home.kind === "slot" ? m.home.slotKey : undefined,
        away: m.away.kind === "slot" ? m.away.slotKey : undefined,
      });
    }
    const { data, error } = await supabase
      .from("matches")
      .insert({
        tournament_id: tournamentId,
        group_id: m.groupIndex ? groupIdByIndex.get(m.groupIndex) : null,
        stage: m.stage,
        round_number: m.round,
        home_team_id: homeTeam,
        away_team_id: awayTeam,
        scheduled_at: m.scheduledAt,
        court_number: m.court,
        duration_min: settings.matchDurationMin,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Матчи: ${error.message}` };
    matchIdByKey.set(m.key, data.id);
  }

  // 3. Bracket slots (source match ids resolved from the map above)
  const slotIdByKey = new Map<string, string>();
  for (const s of result.slots) {
    const { data, error } = await supabase
      .from("bracket_slots")
      .insert({
        tournament_id: tournamentId,
        stage: s.stage,
        slot_index: s.slotIndex,
        label: s.label,
        source_match_id: s.sourceMatchKey ? matchIdByKey.get(s.sourceMatchKey) : null,
        takes_winner: s.takesWinner ?? true,
        seed_rank: s.seedRank ?? null,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Сетка: ${error.message}` };
    slotIdByKey.set(s.key, data.id);
  }

  // 4. Link playoff matches to their slot placeholders
  for (const [matchKey, refs] of slotRefsByMatch) {
    const matchId = matchIdByKey.get(matchKey);
    if (!matchId) continue;
    const update: Record<string, string | null> = {};
    if (refs.home) update.home_slot_id = slotIdByKey.get(refs.home) ?? null;
    if (refs.away) update.away_slot_id = slotIdByKey.get(refs.away) ?? null;
    if (Object.keys(update).length > 0) {
      await supabase.from("matches").update(update).eq("id", matchId);
    }
  }

  revalidatePath("/admin/schedule");
  revalidatePath("/admin/matches");
  revalidatePath("/schedule");
  return { ok: true };
}

/**
 * Destructive reset: removes the whole published calendar (matches, their
 * events/results, bracket slots, groups and standings) so it can be regenerated
 * — e.g. after the team roster changes. Confirmed results ARE discarded, so the
 * UI asks for explicit confirmation before calling this.
 */
export async function resetScheduleAction(): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const tournament = await getActiveTournament();
  if (!tournament) return { ok: false, error: "Турнир не найден" };
  const tid = tournament.id;

  // matches cascade to match_events / match_results / match_periods.
  const steps = [
    supabase.from("matches").delete().eq("tournament_id", tid),
    supabase.from("bracket_slots").delete().eq("tournament_id", tid),
    supabase.from("standings").delete().eq("tournament_id", tid),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) return { ok: false, error: error.message };
  }
  // Detach teams from groups, then drop the groups.
  await supabase.from("teams").update({ group_id: null }).eq("tournament_id", tid);
  await supabase.from("tournament_groups").delete().eq("tournament_id", tid);

  await supabase.rpc("log_audit", {
    p_action: "schedule.reset",
    p_entity_type: "tournament",
    p_entity_id: tid,
    p_summary: "Расписание сброшено для пересоздания",
  });

  revalidatePath("/admin/schedule");
  revalidatePath("/admin/matches");
  revalidatePath("/schedule");
  return { ok: true };
}
