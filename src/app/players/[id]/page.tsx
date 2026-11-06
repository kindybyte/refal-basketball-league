import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayer, getPlayerStatsOne, getTeam } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/env";
import { features } from "@/lib/features";
import { computeAverages, formatPct } from "@/lib/stats";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { SetupNotice } from "@/components/site/setup-notice";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await getPlayer(id);
  // Profiles are not indexed to limit incidental exposure of participants.
  return { title: p?.display_name ?? "Игрок", robots: { index: false } };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const { id } = await params;
  const player = await getPlayer(id);
  if (!player) notFound();

  const [stats, team] = await Promise.all([
    features.individualStats ? getPlayerStatsOne(id) : Promise.resolve(null),
    player.team_id ? getTeam(player.team_id) : Promise.resolve(null),
  ]);
  const avg = stats ? computeAverages(stats) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-lg font-black">
          {player.jersey_number}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{player.display_name}</h1>
            {player.is_demo && <DemoBadge />}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            {team && (
              <Link href={`/teams/${team.id}`} className="hover:underline">
                {team.name}
              </Link>
            )}
            {player.position && <span>· {player.position}</span>}
          </div>
          {!player.name_is_public && (
            <Badge variant="outline" className="mt-1">
              Имя скрыто по настройкам приватности
            </Badge>
          )}
        </div>
      </div>

      {avg && stats ? (
        <>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="Игры" value={String(stats.games_played)} />
            <Stat label="Очки" value={String(avg.ppg)} />
            <Stat label="Подборы" value={String(avg.rpg)} />
            <Stat label="Передачи" value={String(avg.apg)} />
            <Stat label="Перехваты" value={String(avg.spg)} />
            <Stat label="Блоки" value={String(avg.bpg)} />
          </div>
          <Card>
            <CardContent className="grid grid-cols-3 gap-3 p-4 text-sm">
              <PctStat label="2+3 броски (FG%)" value={formatPct(avg.fgPct)} made={stats.fgm} att={stats.fga} />
              <PctStat label="3-очковые (3P%)" value={formatPct(avg.tpPct)} made={stats.tpm} att={stats.tpa} />
              <PctStat label="Штрафные (FT%)" value={formatPct(avg.ftPct)} made={stats.ftm} att={stats.fta} />
            </CardContent>
          </Card>
          <p className="text-xs text-muted">Показаны средние значения за игру.</p>
        </>
      ) : (
        <Card>
          <CardContent className="p-5 text-sm text-muted">
            {features.individualStats
              ? "Индивидуальная статистика этого игрока не публикуется (нет согласия на публикацию) либо матчи ещё не сыграны."
              : "Индивидуальная статистика временно недоступна."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className="text-xl font-black tabular-nums">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </CardContent>
    </Card>
  );
}

function PctStat({ label, value, made, att }: { label: string; value: string; made: number; att: number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-[11px] text-muted">{made}/{att}</div>
    </div>
  );
}
