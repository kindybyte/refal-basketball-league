import Link from "next/link";
import type { PublicStanding } from "@/lib/db-types";
import { Card } from "@/components/ui/card";

export function StandingsTable({ rows }: { rows: PublicStanding[] }) {
  return (
    <Card>
      <div className="table-scroll">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Команда</th>
              <th className="px-2 py-2 text-center font-medium" title="Игры">И</th>
              <th className="px-2 py-2 text-center font-medium" title="Победы">В</th>
              <th className="px-2 py-2 text-center font-medium" title="Поражения">П</th>
              <th className="px-2 py-2 text-center font-medium" title="Забито">ЗО</th>
              <th className="px-2 py-2 text-center font-medium" title="Пропущено">ПО</th>
              <th className="px-2 py-2 text-center font-medium" title="Разница">±</th>
              <th className="px-2 py-2 text-center font-medium" title="Очки">О</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team_id} className="border-b border-border/60">
                <td className="px-3 py-2 text-muted tabular-nums">{r.rank ?? "—"}</td>
                <td className="px-3 py-2">
                  <Link href={`/teams/${r.team_id}`} className="flex items-center gap-2 hover:underline">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="truncate">{r.team_name}</span>
                  </Link>
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{r.played}</td>
                <td className="px-2 py-2 text-center tabular-nums">{r.wins}</td>
                <td className="px-2 py-2 text-center tabular-nums">{r.losses}</td>
                <td className="px-2 py-2 text-center tabular-nums">{r.points_for}</td>
                <td className="px-2 py-2 text-center tabular-nums">{r.points_against}</td>
                <td className="px-2 py-2 text-center tabular-nums">
                  {r.point_diff > 0 ? `+${r.point_diff}` : r.point_diff}
                </td>
                <td className="px-2 py-2 text-center font-semibold tabular-nums">{r.tournament_points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
