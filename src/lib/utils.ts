import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { publicEnv } from "@/lib/env";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Public URL of a team logo stored in the `team-logos` bucket. */
export function teamLogoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = publicEnv.supabaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/team-logos/${path}`;
}
