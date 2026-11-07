"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FormBanner } from "@/components/ui/field";
import { saveTournamentAction } from "@/lib/actions/tournament";

interface SettingsShape {
  format?: string;
  start_date?: string;
  end_date?: string;
  daily_start_time?: string;
  daily_end_time?: string;
  match_duration_min?: number;
  break_between_min?: number;
  min_rest_hours?: number;
  courts_count?: number;
  rounds_per_opponent?: number;
  points_win?: number;
  points_loss?: number;
  points_draw?: number;
  overtime_enabled?: boolean;
  third_place_match?: boolean;
  min_games_for_leaders?: number;
  periods_per_game?: number;
  game_weekdays?: number[];
  match_interval_min?: number;
}

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Вс" },
];

function timeVal(v?: string, fallback = "18:00") {
  return v ? String(v).slice(0, 5) : fallback;
}

export function SettingsForm({
  tournament,
  settings,
}: {
  tournament: { name: string; status: string } | null;
  settings: SettingsShape | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "error" | "success"; msg: string } | null>(null);
  const s = settings ?? {};

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await saveTournamentAction(formData);
      if (res.ok) {
        setBanner({ kind: "success", msg: "Сохранено" });
        router.refresh();
      } else {
        setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-4">
        {banner && <div className="mb-3"><FormBanner kind={banner.kind}>{banner.msg}</FormBanner></div>}
        <form action={submit} className="space-y-5">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted">Турнир</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Название</Label>
                <Input id="name" name="name" required defaultValue={tournament?.name ?? "REFAL Basketball League"} />
              </div>
              <div>
                <Label htmlFor="status">Статус</Label>
                <Select id="status" name="status" defaultValue={tournament?.status ?? "upcoming"}>
                  <option value="upcoming">Скоро</option>
                  <option value="ongoing">Идёт</option>
                  <option value="completed">Завершён</option>
                  <option value="archived">В архиве</option>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted">Формат и сроки</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="format">Формат</Label>
                <Select id="format" name="format" defaultValue={s.format ?? "league_playoff"}>
                  <option value="league_playoff">Лига + плей-офф (топ-4: 1×4, 2×3)</option>
                  <option value="round_robin">Круговой без плей-офф</option>
                  <option value="groups_playoff">Группы + плей-офф</option>
                  <option value="single_elimination">Олимпийская система</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="rounds_per_opponent">Кругов с каждым соперником</Label>
                <Input id="rounds_per_opponent" name="rounds_per_opponent" type="number" min={1} max={4} defaultValue={s.rounds_per_opponent ?? 1} />
              </div>
              <div>
                <Label htmlFor="start_date">Дата начала</Label>
                <Input id="start_date" name="start_date" type="date" required defaultValue={s.start_date ?? "2026-11-03"} />
              </div>
              <div>
                <Label htmlFor="end_date">Дата окончания</Label>
                <Input id="end_date" name="end_date" type="date" required defaultValue={s.end_date ?? "2026-11-30"} />
              </div>
              <div>
                <Label htmlFor="daily_start_time">Начало игрового дня</Label>
                <Input id="daily_start_time" name="daily_start_time" type="time" defaultValue={timeVal(s.daily_start_time, "18:00")} />
              </div>
              <div>
                <Label htmlFor="daily_end_time">Конец игрового дня</Label>
                <Input id="daily_end_time" name="daily_end_time" type="time" defaultValue={timeVal(s.daily_end_time, "23:00")} />
              </div>
            </div>
            <div>
              <Label>Игровые дни недели</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const checked = (s.game_weekdays ?? []).includes(d.value);
                  return (
                    <label
                      key={d.value}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10"
                    >
                      <input type="checkbox" name="weekdays" value={d.value} defaultChecked={checked} />
                      {d.label}
                    </label>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted">
                Оставьте пустым — матчи могут ставиться в любой день диапазона.
                Для «только по вторникам» отметьте «Вт».
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted">Матчи и площадки</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="match_duration_min">Длительность матча (мин)</Label>
                <Input id="match_duration_min" name="match_duration_min" type="number" min={1} defaultValue={s.match_duration_min ?? 80} />
              </div>
              <div>
                <Label htmlFor="break_between_min">Перерыв между матчами</Label>
                <Input id="break_between_min" name="break_between_min" type="number" min={0} defaultValue={s.break_between_min ?? 15} />
              </div>
              <div>
                <Label htmlFor="min_rest_hours">Мин. отдых команды (ч)</Label>
                <Input id="min_rest_hours" name="min_rest_hours" type="number" min={0} defaultValue={s.min_rest_hours ?? 20} />
              </div>
              <div>
                <Label htmlFor="courts_count">Площадок</Label>
                <Input id="courts_count" name="courts_count" type="number" min={1} max={10} defaultValue={s.courts_count ?? 1} />
              </div>
              <div>
                <Label htmlFor="periods_per_game">Четвертей в матче</Label>
                <Input id="periods_per_game" name="periods_per_game" type="number" min={1} max={12} defaultValue={s.periods_per_game ?? 4} />
              </div>
              <div>
                <Label htmlFor="match_interval_min">Интервал между матчами (мин)</Label>
                <Input id="match_interval_min" name="match_interval_min" type="number" min={5} max={360} defaultValue={s.match_interval_min ?? 60} />
              </div>
            </div>
            <p className="text-xs text-muted">
              Интервал — время между началами матчей в один день. 60 ⇒ 19:00,
              20:00, 21:00… Сколько матчей попадёт в один день, зависит от числа
              команд и «мин. отдыха команды».
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted">Очки и правила</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="points_win">Очки за победу</Label>
                <Input id="points_win" name="points_win" type="number" min={0} defaultValue={s.points_win ?? 2} />
              </div>
              <div>
                <Label htmlFor="points_loss">Очки за поражение</Label>
                <Input id="points_loss" name="points_loss" type="number" min={0} defaultValue={s.points_loss ?? 0} />
              </div>
              <div>
                <Label htmlFor="points_draw">Очки за ничью</Label>
                <Input id="points_draw" name="points_draw" type="number" min={0} defaultValue={s.points_draw ?? 1} />
              </div>
              <div>
                <Label htmlFor="min_games_for_leaders">Мин. матчей для рейтингов</Label>
                <Input id="min_games_for_leaders" name="min_games_for_leaders" type="number" min={0} defaultValue={s.min_games_for_leaders ?? 1} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="overtime_enabled" defaultChecked={s.overtime_enabled ?? true} />
                Овертайм при ничьей
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="third_place_match" defaultChecked={s.third_place_match ?? true} />
                Матч за 3-е место
              </label>
            </div>
          </section>

          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение…" : tournament ? "Сохранить настройки" : "Создать турнир"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
