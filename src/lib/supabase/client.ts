"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Browser Supabase client. Uses the ANON key only — every request is subject to
 * RLS. The public site reads exclusively through the `public_*` views, so even
 * this client cannot see personal data (spec §11.1).
 */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
