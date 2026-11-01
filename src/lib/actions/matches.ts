"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/guards";
import type { ActionResult } from "@/lib/actions/types";

/** Admin confirms a submitted result → standings + bracket recompute (RPC). */
export async function confirmMatchResultAction(
  matchId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_match_result", {
    p_match_id: matchId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/matches");
  revalidatePath("/standings");
  return { ok: true };
}

/** Send a pending result back to the operator for correction. */
export async function reopenMatchAction(matchId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("matches")
    .update({ status: "live" })
    .eq("id", matchId)
    .eq("status", "pending_confirmation");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/matches");
  return { ok: true };
}

export async function setMatchStatusAction(
  matchId: string,
  status: "postponed" | "cancelled" | "scheduled",
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("matches")
    .update({ status })
    .eq("id", matchId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/matches");
  return { ok: true };
}
