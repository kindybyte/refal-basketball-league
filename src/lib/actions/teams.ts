"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/guards";
import { getActiveTournament } from "@/lib/queries";
import type { ActionResult } from "@/lib/actions/types";

const teamSchema = z.object({
  name: z.string().trim().min(2, "Название слишком короткое").max(60),
  short_name: z.string().trim().min(1).max(6),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Цвет в формате #RRGGBB"),
  group_id: z.string().uuid().optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

function parse(formData: FormData) {
  return teamSchema.safeParse({
    name: formData.get("name"),
    short_name: formData.get("short_name"),
    color: formData.get("color"),
    group_id: formData.get("group_id") ?? "",
    description: formData.get("description") ?? "",
  });
}

export async function createTeamAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка ввода" };
  }
  const tournament = await getActiveTournament();
  if (!tournament) return { ok: false, error: "Турнир не найден" };

  const supabase = await createClient();
  const { error } = await supabase.from("teams").insert({
    tournament_id: tournament.id,
    name: parsed.data.name,
    short_name: parsed.data.short_name,
    color: parsed.data.color,
    group_id: parsed.data.group_id || null,
    description: parsed.data.description || null,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Команда с таким названием уже есть" : error.message,
    };
  }
  revalidatePath("/admin/teams");
  return { ok: true };
}

export async function updateTeamAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка ввода" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .update({
      name: parsed.data.name,
      short_name: parsed.data.short_name,
      color: parsed.data.color,
      group_id: parsed.data.group_id || null,
      description: parsed.data.description || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/teams");
  return { ok: true };
}

export async function deleteTeamAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/teams");
  return { ok: true };
}

const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Uploads a team logo to the `team-logos` bucket and stores its path.
 *  Validates MIME type + size and uses a random filename (spec §11.7). */
export async function uploadTeamLogoAction(
  teamId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Файл не выбран" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "Файл больше 2 МБ" };
  }
  const ext = ALLOWED_LOGO_TYPES[file.type];
  if (!ext) {
    return { ok: false, error: "Допустимы только PNG, JPEG или WebP" };
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const path = `${teamId}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("team-logos")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return { ok: false, error: `Загрузка не удалась: ${upErr.message}` };

  const supabase = await createClient();
  // Remove the previous object (best effort) before switching the path.
  const { data: prev } = await supabase.from("teams").select("logo_path").eq("id", teamId).maybeSingle();
  if (prev?.logo_path && prev.logo_path !== path) {
    await admin.storage.from("team-logos").remove([prev.logo_path]);
  }
  const { error } = await supabase.from("teams").update({ logo_path: path }).eq("id", teamId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/teams");
  revalidatePath("/teams");
  revalidatePath(`/teams/${teamId}`);
  return { ok: true };
}

export async function removeTeamLogoAction(teamId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: prev } = await supabase.from("teams").select("logo_path").eq("id", teamId).maybeSingle();
  if (prev?.logo_path) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    createAdminClient().storage.from("team-logos").remove([prev.logo_path]);
  }
  const { error } = await supabase.from("teams").update({ logo_path: null }).eq("id", teamId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/teams");
  revalidatePath("/teams");
  return { ok: true };
}
