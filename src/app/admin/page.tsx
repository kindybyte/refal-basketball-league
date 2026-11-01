import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/guards";
import { getCurrentAppUser } from "@/lib/auth";
import { getActiveTournament } from "@/lib/queries";
import { getDashboardMetrics } from "@/lib/admin-queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/site/setup-notice";

export const metadata = { title: "Обзор" };

function Metric({
  label,
  value,
  href,
  highlight,
}: {
  label: string;
  value: number;
  href?: string;
  highlight?: boolean;
}) {
  const inner = (
    <Card className={highlight && value > 0 ? "border-accent" : ""}>
      <CardContent className="p-4">
        <div className="text-2xl font-black tabular-nums">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function AdminDashboard() {
  // Operators don't have a dashboard — send them straight to their matches.
  const me = await getCurrentAppUser();
  if (me?.role === "operator") redirect("/admin/matches");

  await requireAdmin();
  const tournament = await getActiveTournament();

  if (!tournament) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Обзор</h1>
        <EmptyState>
          Турнир ещё не создан.{" "}
          <Link href="/admin/settings" className="text-accent underline">
            Создать турнир в настройках
          </Link>
          .
        </EmptyState>
      </div>
    );
  }

  const m = await getDashboardMetrics(tournament.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{tournament.name}</h1>
        {tournament.is_demo && <DemoBadge />}
        <Badge variant="accent">{tournament.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Команды" value={m.teams} href="/admin/teams" />
        <Metric label="Игроки" value={m.players} href="/admin/players" />
        <Metric label="Сыграно матчей" value={m.matchesPlayed} href="/admin/matches" />
        <Metric label="Предстоит матчей" value={m.matchesUpcoming} href="/admin/matches" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="LIVE сейчас" value={m.liveMatches} href="/admin/matches" highlight />
        <Metric
          label="Результаты на подтверждении"
          value={m.pendingResults}
          href="/admin/matches"
          highlight
        />
        <Metric
          label="Запросы по персональным данным"
          value={m.openPrivacyRequests}
          href="/admin/consents"
          highlight
        />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4 text-sm">
          <h2 className="font-semibold">Быстрый сценарий</h2>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>Создайте команды и зарегистрируйте игроков.</li>
            <li>Организуйте получение согласий (ссылки/QR на странице согласий).</li>
            <li>Сгенерируйте и опубликуйте расписание.</li>
            <li>Назначьте операторов на матчи.</li>
            <li>Оператор ведёт матч → вы подтверждаете результат.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
