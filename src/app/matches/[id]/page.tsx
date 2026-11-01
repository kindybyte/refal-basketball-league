import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMatch, getMatchEvents } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { MatchLiveView } from "./match-live";
import { SetupNotice } from "@/components/site/setup-notice";
import type { PublicMatchEvent } from "@/lib/db-types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const m = await getMatch(id);
  return { title: m ? `${m.home_label} — ${m.away_label}` : "Матч" };
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const { id } = await params;
  const match = await getMatch(id);
  if (!match) notFound();
  const events = (await getMatchEvents(id)) as PublicMatchEvent[];

  return <MatchLiveView matchId={id} initialMatch={match} initialEvents={events} />;
}
