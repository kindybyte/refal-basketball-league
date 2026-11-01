"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/guards";
import { getActiveTournament } from "@/lib/queries";
import { publicEnv } from "@/lib/env";
import type { ActionResult } from "@/lib/actions/types";

const playerSchema = z.object({
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  team_id: z.string().uuid().optional().or(z.literal("")),
  jersey_number: z.coerce.number().int().min(0).max(99),
  internal_code: z.string().trim().max(40).optional().or(z.literal("")),
  position: z.string().trim().max(30).optional().or(z.literal("")),
  public_alias: z.string().trim().max(40).optional().or(z.literal("")),
  is_minor: z.union([z.literal("on"), z.literal("")]).optional(),
});

function parse(formData: FormData) {
  return playerSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    team_id: formData.get("team_id") ?? "",
    jersey_number: formData.get("jersey_number"),
    internal_code: formData.get("internal_code") ?? "",
    position: formData.get("position") ?? "",
    public_alias: formData.get("public_alias") ?? "",
    is_minor: (formData.get("is_minor") as string | null) ?? "",
  });
}

function jerseyError(code?: string): string | undefined {
  if (code === "23505") return "Этот игровой номер уже занят в команде";
  return undefined;
}

export async function createPlayerAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка ввода" };
  const tournament = await getActiveTournament();
  if (!tournament) return { ok: false, error: "Турнир не найден" };

  const d = parsed.data;
  const internalCode =
    d.internal_code || `P-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const supabase = await createClient();
  const { error } = await supabase.from("players").insert({
    tournament_id: tournament.id,
    team_id: d.team_id || null,
    first_name: d.first_name,
    last_name: d.last_name,
    jersey_number: d.jersey_number,
    internal_code: internalCode,
    position: d.position || null,
    public_alias: d.public_alias || null,
    is_minor: d.is_minor === "on",
  });
  if (error) {
    return { ok: false, error: jerseyError(error.code) ?? error.message };
  }
  revalidatePath("/admin/players");
  return { ok: true };
}

export async function updatePlayerAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parse(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка ввода" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("players")
    .update({
      team_id: d.team_id || null,
      first_name: d.first_name,
      last_name: d.last_name,
      jersey_number: d.jersey_number,
      position: d.position || null,
      public_alias: d.public_alias || null,
      is_minor: d.is_minor === "on",
      ...(d.internal_code ? { internal_code: d.internal_code } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false, error: jerseyError(error.code) ?? error.message };
  revalidatePath("/admin/players");
  return { ok: true };
}

export async function deletePlayerAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/players");
  return { ok: true };
}

/** Issues a one-time consent token and returns the ready-to-share link. */
export async function issueConsentLinkAction(
  playerId: string,
): Promise<ActionResult & { url?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_consent_token", {
    p_player_id: playerId,
    p_ttl_hours: 72,
  });
  if (error || !data) return { ok: false, error: error?.message ?? "Не удалось создать токен" };
  const url = `${publicEnv.siteUrl.replace(/\/$/, "")}/consent/${data}`;
  return { ok: true, url };
}

const contactsSchema = z.object({
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Некорректный email").optional().or(z.literal("")),
  purpose_note: z.string().trim().max(200).optional().or(z.literal("")),
});

/** Stores/updates contacts in the protected table (admin only). */
export async function saveContactsAction(
  playerId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = contactsSchema.safeParse({
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    purpose_note: formData.get("purpose_note") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка ввода" };
  const d = parsed.data;

  const supabase = await createClient();
  // If everything is empty, remove the contact row entirely (data minimisation).
  if (!d.phone && !d.email) {
    await supabase.from("private_player_contacts").delete().eq("player_id", playerId);
    revalidatePath("/admin/players");
    return { ok: true };
  }
  const { error } = await supabase.from("private_player_contacts").upsert({
    player_id: playerId,
    phone: d.phone || null,
    email: d.email || null,
    purpose_note: d.purpose_note || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/players");
  return { ok: true };
}
