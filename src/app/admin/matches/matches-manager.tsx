"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, FormBanner } from "@/components/ui/field";
import { Badge, LiveBadge } from "@/components/ui/badge";
import type { PublicMatch } from "@/lib/db-types";
import { formatDateTime, stageLabel, statusLabel } from "@/lib/format";
import { confirmMatchResultAction, reopenMatchAction } from "@/lib/actions/matches";
import { assignOperatorAction, unassignOperatorAction } from "@/lib/actions/operators";

interface Operator {
  id: string;
  full_name: string;
}

export function MatchesManager({
  matches,
  operators,
  assignments,
  isAdmin,
}: {
  matches: PublicMatch[];
  operators: Operator[];
  assignments: Record<string, { id: string; name: string }>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "error" | "success"; msg: string } | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { setBanner({ kind: "success", msg: okMsg }); router.refresh(); }
      else setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
    });
  }

  return (
    <div className="space-y-3">
      {banner && <FormBanner kind={banner.kind}>{banner.msg}</FormBanner>}
      {matches.length === 0 && <p className="text-sm text-muted">Матчей нет.</p>}

      {matches.map((m) => {
        const isLive = m.status === "live";
        const pending2 = m.status === "pending_confirmation";
        const assigned = assignments[m.id];
        const teamsReady = !!m.home_team_id && !!m.away_team_id;
        return (
          <Card key={m.id}>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>{stageLabel(m.stage)}</span>
                {isLive ? <LiveBadge /> : <span>{formatDateTime(m.scheduled_at)}</span>}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {m.home_label} — {m.away_label}
                </div>
                <div className="tabular-nums text-sm font-semibold">
                  {m.home_score ?? "–"} : {m.away_score ?? "–"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Badge variant={m.is_final ? "muted" : pending2 ? "accent" : "outline"}>
                  {statusLabel(m.status)}
                </Badge>
                {assigned && <Badge variant="muted">оператор: {assigned.name}</Badge>}
              </div>

              <div className="flex flex-wrap gap-1 pt-1">
                {(m.status === "scheduled" || isLive || pending2) &&
                  (teamsReady ? (
                    <Link href={`/admin/matches/${m.id}/control`}>
                      <Button size="sm" variant={isLive ? "primary" : "secondary"}>
                        {isLive ? "LIVE-консоль" : "Открыть консоль"}
                      </Button>
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">
                      Участники не определены — консоль недоступна
                    </span>
                  ))}

                {isAdmin && pending2 && (
                  <>
                    <Button size="sm" variant="primary" disabled={pending}
                      onClick={() => run(() => confirmMatchResultAction(m.id), "Результат подтверждён")}>
                      Подтвердить результат
                    </Button>
                    <Button size="sm" variant="outline" disabled={pending}
                      onClick={() => run(() => reopenMatchAction(m.id), "Матч возвращён оператору")}>
                      Вернуть
                    </Button>
                  </>
                )}
              </div>

              {isAdmin && !m.is_final && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <span className="text-xs text-muted">Оператор:</span>
                  <Select
                    className="h-8 w-auto py-0 text-xs"
                    defaultValue={assigned?.id ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) run(() => assignOperatorAction(m.id, v), "Оператор назначен");
                      else run(() => unassignOperatorAction(m.id), "Назначение снято");
                    }}
                  >
                    <option value="">— не назначен —</option>
                    {operators.map((o) => (
                      <option key={o.id} value={o.id}>{o.full_name}</option>
                    ))}
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
