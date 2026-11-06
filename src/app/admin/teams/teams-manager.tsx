"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select, FormBanner } from "@/components/ui/field";
import {
  createTeamAction,
  updateTeamAction,
  deleteTeamAction,
  uploadTeamLogoAction,
  removeTeamLogoAction,
} from "@/lib/actions/teams";
import { TeamAvatar } from "@/components/team-avatar";

interface TeamRow {
  id: string;
  name: string;
  short_name: string;
  color: string;
  group_id: string | null;
  description: string | null;
  logo_path: string | null;
}
interface Group {
  id: string;
  name: string;
}

export function TeamsManager({
  teams,
  groups,
}: {
  teams: TeamRow[];
  groups: Group[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [banner, setBanner] = useState<{ kind: "error" | "success"; msg: string } | null>(
    null,
  );

  const key = editing?.id ?? "new";

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = editing
        ? await updateTeamAction(editing.id, formData)
        : await createTeamAction(formData);
      if (res.ok) {
        setBanner({ kind: "success", msg: editing ? "Команда обновлена" : "Команда создана" });
        setEditing(null);
        router.refresh();
      } else {
        setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Удалить команду? Это действие необратимо.")) return;
    startTransition(async () => {
      const res = await deleteTeamAction(id);
      if (res.ok) {
        setBanner({ kind: "success", msg: "Команда удалена" });
        router.refresh();
      } else {
        setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
      }
    });
  }

  function uploadLogo(id: string, file: File) {
    const fd = new FormData();
    fd.append("logo", file);
    startTransition(async () => {
      const res = await uploadTeamLogoAction(id, fd);
      if (res.ok) { setBanner({ kind: "success", msg: "Логотип обновлён" }); router.refresh(); }
      else setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
    });
  }

  function removeLogo(id: string) {
    startTransition(async () => {
      const res = await removeTeamLogoAction(id);
      if (res.ok) { setBanner({ kind: "success", msg: "Логотип удалён" }); router.refresh(); }
      else setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 font-semibold">
            {editing ? "Редактирование команды" : "Новая команда"}
          </h2>
          {banner && <div className="mb-3"><FormBanner kind={banner.kind}>{banner.msg}</FormBanner></div>}
          <form key={key} action={submit} className="space-y-3">
            <div>
              <Label htmlFor="name">Название</Label>
              <Input id="name" name="name" required defaultValue={editing?.name ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="short_name">Короткое (до 6)</Label>
                <Input
                  id="short_name"
                  name="short_name"
                  required
                  maxLength={6}
                  defaultValue={editing?.short_name ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="color">Цвет</Label>
                <Input
                  id="color"
                  name="color"
                  type="color"
                  defaultValue={editing?.color ?? "#e8793a"}
                  className="h-10 p-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="group_id">Группа (необязательно)</Label>
              <Select id="group_id" name="group_id" defaultValue={editing?.group_id ?? ""}>
                <option value="">— без группы —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="description">Описание (необязательно)</Label>
              <Textarea id="description" name="description" defaultValue={editing?.description ?? ""} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Сохранение…" : editing ? "Сохранить" : "Создать"}
              </Button>
              {editing && (
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Отмена
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="font-semibold">Команды ({teams.length})</h2>
        {teams.length === 0 && (
          <p className="text-sm text-muted">Пока нет команд.</p>
        )}
        {teams.map((t) => (
          <Card key={t.id}>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <TeamAvatar name={t.name} short={t.short_name} color={t.color} logoPath={t.logo_path} size={36} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted">
                      {t.short_name}
                      {t.group_id && groups.find((g) => g.id === t.group_id)
                        ? ` · ${groups.find((g) => g.id === t.group_id)!.name}`
                        : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(t); setBanner(null); }}>
                    Изм.
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(t.id)} disabled={pending}>
                    Удал.
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-2">
                <label className="cursor-pointer text-xs font-medium text-accent hover:underline">
                  {t.logo_path ? "Заменить логотип" : "Загрузить логотип"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={pending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadLogo(t.id, f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {t.logo_path && (
                  <button className="text-xs text-muted hover:text-live" onClick={() => removeLogo(t.id)} disabled={pending}>
                    удалить
                  </button>
                )}
                <span className="ml-auto text-[11px] text-muted">PNG/JPEG/WebP, до 2 МБ</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
