/**
 * Centralised, validated environment access.
 *
 * Public vars (NEXT_PUBLIC_*) are safe in the browser. The service-role key is
 * read lazily and ONLY from server code — importing it in a client component
 * would throw at build/runtime, which is the behaviour we want.
 */

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export function assertPublicEnv(): void {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.local.example to .env.local and fill in your Supabase keys.",
    );
  }
}

/** Server-only. Throws if called from a context without the service-role key. */
export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. This is required for privileged " +
        "server operations and must never be exposed to the browser.",
    );
  }
  return key;
}

/** True when Supabase is configured; lets pages render a friendly setup notice. */
export const isSupabaseConfigured =
  !!publicEnv.supabaseUrl && !!publicEnv.supabaseAnonKey;
