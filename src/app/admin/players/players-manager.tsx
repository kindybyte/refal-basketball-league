"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, FormBanner } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import {
  createPlayerAction,
  updatePlayerAction,
  deletePlayerAction,
  issueConsentLinkAction,
  saveContactsAction,
} from "@/lib/actions/players";

export interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string | null;
  jersey_number: number;
  internal_code: string;
  position: string | null;
  public_alias: string | null;
  is_minor: boolean;
  name_consent: boolean;
  stats_consent: boolean;
  contacts: { phone: string; email: string; purpose_note: string } | null;
}
interface Team {
  id: string;
  name: string;
  short_name: string;
}

export function PlayersManager({
  players,
  teams,
}: {
  players: PlayerRow[];
  teams: Team[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<PlayerRow | null>(null);
  const [banner, setBanner] = useState<{ kind: "error" | "success"; msg: string } | null>(null);
  const [panel, setPanel] = useState<{ id: string; kind: "consent" | "contacts" } | null>(null);
  const [consentUrl, setConsentUrl] = useState<string | null>(null);

  const teamName = (id: string | null) =>
    teams.find((t) => t.id === id)?.short_name ?? "—";

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = editing
        ? await updatePlayerAction(editing.id, formData)
        : await createPlayerAction(formData);
      if (res.ok) {
        setBanner({ kind: "success", msg: editing ? "Игрок обновлён" : "Игрок добавлен" });
        setEditing(null);
        router.refresh();
      } else {
        setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Удалить игрока? Это действие необратимо.")) return;
    startTransition(async () => {
      const res = await deletePlayerAction(id);
      if (res.ok) { router.refresh(); setBanner({ kind: "success", msg: "Игрок удалён" }); }
      else setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
    });
  }

  function issueLink(id: string) {
    setConsentUrl(null);
    setPanel({ id, kind: "consent" });
    startTransition(async () => {
      const res = await issueConsentLinkAction(id);
      if (res.ok && res.url) setConsentUrl(res.url);
      else setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
    });
  }

  function saveContacts(id: string, formData: FormData) {
    startTransition(async () => {
      const res = await saveContactsAction(id, formData);
      if (res.ok) { setPanel(null); router.refresh(); setBanner({ kind: "success", msg: "Контакты сохранены" }); }
      else setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="self-start">
        <CardContent className="p-4">
          <h2 className="mb-3 font-semibold">
            {editing ? "Редактирование игрока" : "Новый игрок"}
          </h2>
          {banner && <div className="mb-3"><FormBanner kind={banner.kind}>{banner.msg}</FormBanner></div>}
          <form key={editing?.id ?? "new"} action={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="first_name">Имя</Label>
                <Input id="first_name" name="first_name" required defaultValue={editing?.first_name ?? ""} />
              </div>
              <div>
                <Label htmlFor="last_name">Фамилия</Label>
                <Input id="last_name" name="last_name" required defaultValue={editing?.last_name ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="team_id">Команда</Label>
                <Select id="team_id" name="team_id" defaultValue={editing?.team_id ?? ""}>
                  <option value="">— без команды —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="jersey_number">Номер</Label>
                <Input id="jersey_number" name="jersey_number" type="number" min={0} max={99} required defaultValue={editing?.jersey_number ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="position">Позиция (необяз.)</Label>
                <Input id="position" name="position" defaultValue={editing?.position ?? ""} placeholder="PG / SG / …" />
              </div>
              <div>
                <Label htmlFor="public_alias">Псевдоним (необяз.)</Label>
                <Input id="public_alias" name="public_alias" defaultValue={editing?.public_alias ?? ""} />
              </div>
            </div>
            <div>
              <Label htmlFor="internal_code">Внутренний код (авто, если пусто)</Label>
              <Input id="internal_code" name="internal_code" defaultValue={editing?.internal_code ?? ""} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_minor" defaultChecked={editing?.is_minor ?? false} />
              Несовершеннолетний (требуется согласие законного представителя)
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Сохранение…" : editing ? "Сохранить" : "Добавить"}
              </Button>
              {editing && (
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Отмена</Button>
              )}
            </div>
          </form>
          <p className="mt-3 text-xs text-muted">
            Мы не запрашиваем дату рождения, адрес, документы и медицинские данные.
            Телефон/email — только при необходимости, вводятся отдельно и никогда
            не публикуются.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="font-semibold">Игроки ({players.length})</h2>
        {players.length === 0 && <p className="text-sm text-muted">Пока нет игроков.</p>}
        {players.map((p) => (
          <Card key={p.id}>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    №{p.jersey_number} {p.first_name} {p.last_name}
                    {p.is_minor && <span className="ml-1 text-xs text-amber-600">н/л</span>}
                  </div>
                  <div className="text-xs text-muted">{teamName(p.team_id)} · {p.internal_code}</div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(p); setBanner(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Изм.</Button>
                  <Button size="sm" variant="danger" onClick={() => remove(p.id)} disabled={pending}>Удал.</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant={p.name_consent ? "accent" : "outline"}>
                  Имя: {p.name_consent ? "публично" : "скрыто"}
                </Badge>
                <Badge variant={p.stats_consent ? "accent" : "outline"}>
                  Статистика: {p.stats_consent ? "публично" : "скрыто"}
                </Badge>
                {p.contacts && <Badge variant="muted">контакты есть</Badge>}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => issueLink(p.id)} disabled={pending}>
                  Ссылка согласия
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setPanel(panel?.id === p.id && panel.kind === "contacts" ? null : { id: p.id, kind: "contacts" }); setConsentUrl(null); }}>
                  Контакты
                </Button>
              </div>

              {panel?.id === p.id && panel.kind === "consent" && (
                <div className="rounded-lg bg-surface-2 p-2 text-xs">
                  {consentUrl ? (
                    <div className="space-y-2">
                      <p className="text-muted">Одноразовая ссылка (действует 72 часа). Передайте игроку лично:</p>
                      <div className="flex gap-1">
                        <Input readOnly value={consentUrl} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
                        <Button size="sm" type="button" onClick={() => navigator.clipboard?.writeText(consentUrl)}>Копировать</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted">Создание ссылки…</p>
                  )}
                </div>
              )}

              {panel?.id === p.id && panel.kind === "contacts" && (
                <form
                  action={(fd) => saveContacts(p.id, fd)}
                  className="space-y-2 rounded-lg bg-surface-2 p-2"
                >
                  <p className="text-xs text-muted">
                    Защищённые контакты. Не публикуются, не экспортируются, доступны
                    только администратору. Оставьте пустыми, чтобы удалить.
                  </p>
                  <Input name="phone" placeholder="Телефон" defaultValue={p.contacts?.phone ?? ""} />
                  <Input name="email" type="email" placeholder="Email" defaultValue={p.contacts?.email ?? ""} />
                  <Input name="purpose_note" placeholder="Зачем нужны (основание)" defaultValue={p.contacts?.purpose_note ?? ""} />
                  <Button size="sm" type="submit" disabled={pending}>Сохранить контакты</Button>
                </form>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
