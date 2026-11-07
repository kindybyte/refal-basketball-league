"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/guards";
import { getActiveTournament } from "@/lib/queries";
import type { ActionResult } from "@/lib/actions/types";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  status: z.enum(["upcoming", "ongoing", "completed", "archived"]),
  format: z.enum(["round_robin", "groups_playoff", "single_elimination", "league_playoff"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daily_start_time: z.string().regex(/^\d{2}:\d{2}$/),
  daily_end_time: z.string().regex(/^\d{2}:\d{2}$/),
  match_duration_min: z.coerce.number().int().min(1).max(240),
  break_between_min: z.coerce.number().int().min(0).max(240),
  min_rest_hours: z.coerce.number().int().min(0).max(168),
  courts_count: z.coerce.number().int().min(1).max(10),
  rounds_per_opponent: z.coerce.number().int().min(1).max(4),
  points_win: z.coerce.number().int().min(0).max(10),
  points_loss: z.coerce.number().int().min(0).max(10),
  points_draw: z.coerce.number().int().min(0).max(10),
  overtime_enabled: z.union([z.literal("on"), z.literal("")]).optional(),
  third_place_match: z.union([z.literal("on"), z.literal("")]).optional(),
  min_games_for_leaders: z.coerce.number().int().min(0).max(50),
  periods_per_game: z.coerce.number().int().min(1).max(12),
  groups_count: z.coerce.number().int().min(1).max(8).optional(),
  match_interval_min: z.coerce.number().int().min(5).max(360),
});

export async function saveTournamentAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка ввода" };
  }
  const d = parsed.data;
  // Weekday checkboxes (repeated key) — parsed separately from the object schema.
  const weekdays = formData
    .getAll("weekdays")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (d.end_date < d.start_date) {
    return { ok: false, error: "Дата окончания раньше даты начала" };
  }

  const supabase = await createClient();
  const existing = await getActiveTournament();

  let tournamentId = existing?.id;
  if (!tournamentId) {
    const { data, error } = await supabase
      .from("tournaments")
      .insert({ name: d.name, status: d.status })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    tournamentId = data.id;
  } else {
    const { error } = await supabase
      .from("tournaments")
      .update({ name: d.name, status: d.status })
      .eq("id", tournamentId);
    if (error) return { ok: false, error: error.message };
  }

  const settingsRow = {
    tournament_id: tournamentId,
    format: d.format,
    start_date: d.start_date,
    end_date: d.end_date,
    daily_start_time: d.daily_start_time,
    daily_end_time: d.daily_end_time,
    match_duration_min: d.match_duration_min,
    break_between_min: d.break_between_min,
    min_rest_hours: d.min_rest_hours,
    courts_count: d.courts_count,
    rounds_per_opponent: d.rounds_per_opponent,
    points_win: d.points_win,
    points_loss: d.points_loss,
    points_draw: d.points_draw,
    overtime_enabled: d.overtime_enabled === "on",
    third_place_match: d.third_place_match === "on",
    min_games_for_leaders: d.min_games_for_leaders,
    periods_per_game: d.periods_per_game,
    game_weekdays: weekdays,
    match_interval_min: d.match_interval_min,
  };
  const { error: sErr } = await supabase
    .from("tournament_settings")
    .upsert(settingsRow, { onConflict: "tournament_id" });
  if (sErr) return { ok: false, error: sErr.message };

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true };
}

/** Archive the active tournament (spec §17 — archiving completed tournaments). */
export async function archiveTournamentAction(): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const t = await getActiveTournament();
  if (!t) return { ok: false, error: "Турнир не найден" };
  const { error } = await supabase
    .from("tournaments")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", t.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}
