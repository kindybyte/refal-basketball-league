import { redirect } from "next/navigation";
import { getCurrentAppUser, type AppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Any signed-in app user (admin or operator); otherwise → /login. */
export async function requireAppUser(next = "/admin"): Promise<AppUser> {
  const user = await getCurrentAppUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/**
 * Admin-only UI gate (defense in depth; the database RLS/functions enforce the
 * same rules regardless of what the UI allows). MFA is optional — see login.
 */
export async function requireAdmin(next = "/admin"): Promise<AppUser> {
  const user = await requireAppUser(next);
  if (user.role !== "admin") redirect("/admin/denied");
  return user;
}

/** Admin, or the operator actively assigned to this specific match. */
export async function requireMatchController(
  matchId: string,
  next: string,
): Promise<AppUser> {
  const user = await requireAppUser(next);
  if (user.role === "admin") return user;

  const supabase = await createClient();
  const { data } = await supabase
    .from("operator_assignments")
    .select("id")
    .eq("match_id", matchId)
    .eq("operator_user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) redirect("/admin/denied");
  return user;
}
