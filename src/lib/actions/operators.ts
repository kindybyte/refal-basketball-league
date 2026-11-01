"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/guards";
import type { ActionResult } from "@/lib/actions/types";

const inviteSchema = z.object({
  email: z.string().trim().email("Некорректный email"),
  full_name: z.string().trim().min(2).max(60),
  password: z.string().min(8, "Пароль не короче 8 символов").max(72),
});

/**
 * Invite an operator: create a confirmed auth user (service role) and link an
 * app_users row with role='operator'. Returns nothing sensitive beyond success;
 * the admin shares the temporary password out-of-band and the operator changes
 * it. Operators sign in by invite only (spec §3).
 */
export async function inviteOperatorAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ошибка ввода" };
  }
  const { email, full_name, password } = parsed.data;

  const service = createAdminClient();
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (createErr || !created.user) {
    return { ok: false, error: createErr?.message ?? "Не удалось создать пользователя" };
  }

  // Link the role. Use the service client so the row is created regardless of
  // the inviter's RLS, then audit under the admin's identity.
  const { error: linkErr } = await service.from("app_users").insert({
    id: created.user.id,
    role: "operator",
    full_name,
    created_by: admin.id,
  });
  if (linkErr) {
    // Roll back the auth user to avoid an orphaned account.
    await service.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: linkErr.message };
  }

  const supabase = await createClient();
  await supabase.rpc("log_audit", {
    p_action: "operator.invite",
    p_entity_type: "app_user",
    p_entity_id: created.user.id,
    p_summary: `Приглашён оператор ${full_name}`,
  });

  revalidatePath("/admin/operators");
  return { ok: true };
}

export async function assignOperatorAction(
  matchId: string,
  operatorUserId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  // Revoke any existing active assignment for this match first (one operator).
  await supabase
    .from("operator_assignments")
    .update({ revoked_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .is("revoked_at", null);

  const { error } = await supabase.from("operator_assignments").insert({
    match_id: matchId,
    operator_user_id: operatorUserId,
    assigned_by: admin.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/matches");
  revalidatePath("/admin/operators");
  return { ok: true };
}

export async function unassignOperatorAction(
  matchId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("operator_assignments")
    .update({ revoked_at: new Date().toISOString() })
    .eq("match_id", matchId)
    .is("revoked_at", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/matches");
  return { ok: true };
}

export async function disableOperatorAction(
  operatorUserId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_users")
    .update({ status: "disabled" })
    .eq("id", operatorUserId)
    .eq("role", "operator");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/operators");
  return { ok: true };
}
