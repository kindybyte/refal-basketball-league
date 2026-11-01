"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormBanner } from "@/components/ui/field";
import {
  previewScheduleAction,
  publishScheduleAction,
  type SchedulePreview,
} from "@/lib/actions/schedule";
import { stageLabel, formatDateTime } from "@/lib/format";

export function ScheduleManager({
  alreadyPublished,
  teamCount,
}: {
  alreadyPublished: boolean;
  teamCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [banner, setBanner] = useState<{ kind: "error" | "success" | "info"; msg: string } | null>(null);

  function doPreview() {
    setBanner(null);
    startTransition(async () => {
      const res = await previewScheduleAction();
      if (res.ok && res.preview) setPreview(res.preview);
      else setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
    });
  }

  function doPublish() {
    if (!confirm("Опубликовать расписание? Матчи станут видны на сайте.")) return;
    startTransition(async () => {
      const res = await publishScheduleAction();
      if (res.ok) {
        setBanner({ kind: "success", msg: "Расписание опубликовано" });
        setPreview(null);
        router.refresh();
      } else {
        setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
      }
    });
  }

  const canFit = preview && preview.errors.length === 0;

  return (
    <div className="space-y-4">
      {alreadyPublished ? (
        <FormBanner kind="info">
          Расписание уже опубликовано. Повторная генерация отключена, чтобы не
          потерять сыгранные результаты.{" "}
          <Link href="/admin/matches" className="underline">
            Перейти к матчам
          </Link>
          .
        </FormBanner>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <p className="text-muted">
              Активных команд: <strong className="text-foreground">{teamCount}</strong>. Генератор
              распределит матчи по дням и площадкам с учётом отдыха и без
              конфликтов. Сначала посмотрите предпросмотр, затем опубликуйте.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={doPreview} disabled={pending || teamCount < 2}>
                {pending ? "Генерация…" : "Сгенерировать предпросмотр"}
              </Button>
              {canFit && (
                <Button variant="primary" onClick={doPublish} disabled={pending}>
                  Опубликовать
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {banner && <FormBanner kind={banner.kind}>{banner.msg}</FormBanner>}

      {preview && (
        <div className="space-y-4">
          {preview.errors.length > 0 && (
            <FormBanner kind="error">
              <div className="space-y-1">
                <p className="font-semibold">Календарь не помещается:</p>
                <ul className="list-disc pl-5">
                  {preview.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
                <p>Измените даты, время дня, число площадок или отдых и попробуйте снова.</p>
              </div>
            </FormBanner>
          )}
          {preview.warnings.length > 0 && (
            <FormBanner kind="info">
              <ul className="list-disc pl-5">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </FormBanner>
          )}

          {preview.groups.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {preview.groups.map((g) => (
                <Card key={g.name}>
                  <CardContent className="p-3">
                    <h3 className="mb-1 text-sm font-semibold">{g.name}</h3>
                    <ul className="text-sm text-muted">
                      {g.teamNames.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-medium">Этап</th>
                      <th className="px-3 py-2 text-left font-medium">Матч</th>
                      <th className="px-3 py-2 text-left font-medium">Когда</th>
                      <th className="px-2 py-2 text-center font-medium">Пл.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.matches.map((m, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="px-3 py-2">
                          <Badge variant="outline">{stageLabel(m.stage)}</Badge>
                          {m.groupName && <span className="ml-1 text-xs text-muted">{m.groupName}</span>}
                        </td>
                        <td className="px-3 py-2">
                          {m.homeLabel} — {m.awayLabel}
                        </td>
                        <td className="px-3 py-2 text-muted">{formatDateTime(m.scheduledAt)}</td>
                        <td className="px-2 py-2 text-center">{m.court}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted">Всего матчей: {preview.matches.length}</p>
        </div>
      )}
    </div>
  );
}
