import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { getServiceRoleKey } from "@/lib/env";

/**
 * SERVER-ONLY privileged client. Bypasses RLS via the service-role key.
 *
 * The `server-only` import makes bundling this into client code a build error.
 * Use ONLY for operations that genuinely require elevated rights and that are
 * themselves guarded by an explicit role check first (e.g. creating auth users,
 * storage admin). Never use it to shortcut the RLS-backed read paths.
 */
export function createAdminClient() {
  return createSupabaseClient(publicEnv.supabaseUrl, getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
