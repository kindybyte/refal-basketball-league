import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/db-types";

export interface AppUser {
  id: string;
  role: AppRole;
  fullName: string;
  status: "active" | "disabled";
}

/**
 * Resolve the current signed-in app user (admin/operator) + role, or null.
 * The role is read from the app_users table under RLS (a user can read their
 * own row), so this is authoritative, not a client-supplied claim.
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("app_users")
    .select("id, role, full_name, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || data.status !== "active") return null;
  return {
    id: data.id,
    role: data.role as AppRole,
    fullName: data.full_name,
    status: data.status as "active" | "disabled",
  };
}

/** True only when the signed-in user has completed an MFA (aal2) challenge. */
export async function hasMfaAssurance(): Promise<boolean> {
  const supabase = await createClient();
  const { data } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal2";
}
