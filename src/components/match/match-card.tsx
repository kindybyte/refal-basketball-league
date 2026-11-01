import Link from "next/link";
import type { PublicMatch } from "@/lib/db-types";
import { Card } from "@/components/ui/card";
import { LiveBadge, Badge, DemoBadge } from "@/components/ui/badge";
import { formatDateTime, stageLabel, statusLabel } from "@/lib/format";

function TeamRow({
  label,
  color,
  score,
  winner,
}: {
  label: string;
  color: string | null;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: color ?? "var(--color-muted)" }}
          aria-hidden
        />
        <span className={`truncate text-sm ${winner ? "font-bold" : ""}`}>
          {label}
        </span>
      </div>
      <span
        className={`tabular-nums text-base ${winner ? "font-bold" : "font-medium"}`}
      >
        {score ?? "—"}
      </span>
    </div>
  );
}

export function MatchCard({ match }: { match: PublicMatch }) {
  const isLive = match.status === "live";
  const homeWin = match.is_final && match.winner_team_id === match.home_team_id;
  const awayWin = match.is_final && match.winner_team_id === match.away_team_id;

  return (
    <Link href={`/matches/${match.id}`} className="block">
      <Card className="p-3 transition-colors hover:border-accent">
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>{stageLabel(match.stage)}</span>
          <span className="flex items-center gap-1.5">
            {match.is_demo && <DemoBadge />}
            {isLive ? (
              <LiveBadge />
            ) : match.is_final ? (
              <Badge variant="muted">Завершён</Badge>
            ) : (
              <span>{formatDateTime(match.scheduled_at)}</span>
            )}
          </span>
        </div>
        <div className="space-y-1.5">
          <TeamRow
            label={match.home_label}
            color={match.home_color}
            score={match.home_score}
            winner={homeWin}
          />
          <TeamRow
            label={match.away_label}
            color={match.away_color}
            score={match.away_score}
            winner={awayWin}
          />
        </div>
        {!match.is_final && !isLive && (
          <p className="mt-2 text-xs text-muted">
            {statusLabel(match.status)} · Площадка {match.court_number}
          </p>
        )}
      </Card>
    </Link>
  );
}
