"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FormBanner } from "@/components/ui/field";

/** Minimal, XSS-safe markdown: escape first, then apply a few inline rules. */
function renderMd(md: string): string {
  const esc = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split("\n")
    .map((line) => {
      if (line.startsWith("## "))
        return `<h2 class="text-base font-bold mt-3">${line.slice(3)}</h2>`;
      if (line.startsWith("- "))
        return `<li class="ml-4 list-disc">${inline(line.slice(2))}</li>`;
      if (line.trim() === "") return "";
      return `<p>${inline(line)}</p>`;
    })
    .join("");
}
function inline(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function ConsentForm({
  token,
  version,
  bodyMd,
}: {
  token: string;
  version: string;
  bodyMd: string;
}) {
  const supabase = createClient();
  const [publishName, setPublishName] = useState(false);
  const [publishStats, setPublishStats] = useState(false);
  const [signer, setSigner] = useState<"self" | "legal_guardian">("self");
  const [alias, setAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { name: boolean; stats: boolean }>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: rpcErr } = await supabase.rpc("record_consent", {
      p_raw_token: token,
      p_publish_name: publishName,
      p_publish_stats: publishStats,
      p_signer: signer,
      p_alias: alias.trim() || null,
      p_text_version: version,
    });
    setLoading(false);
    if (rpcErr) {
      const m = rpcErr.message || "";
      if (m.includes("invalid token")) setError("Ссылка недействительна.");
      else if (m.includes("already used")) setError("Эта ссылка уже была использована.");
      else if (m.includes("expired")) setError("Срок действия ссылки истёк. Запросите новую у организатора.");
      else if (m.includes("minor")) setError("Для несовершеннолетнего требуется согласие законного представителя — выберите соответствующий вариант ниже.");
      else setError("Не удалось сохранить согласие. Попробуйте позже.");
      return;
    }
    setDone({ name: publishName, stats: publishStats });
  }

  if (done) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-sm">
          <h1 className="text-lg font-bold">Спасибо, ваш выбор сохранён</h1>
          <ul className="space-y-1">
            <li>Публикация имени и фамилии: <strong>{done.name ? "разрешена" : "не разрешена"}</strong></li>
            <li>Публикация индивидуальной статистики: <strong>{done.stats ? "разрешена" : "не разрешена"}</strong></li>
          </ul>
          <p className="text-muted">
            Вы можете в любой момент отозвать согласие, обратившись к организатору
            турнира. Отказ от публикации не влияет на участие в турнире.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div
          className="space-y-1 text-sm leading-relaxed [&_h2]:text-foreground"
          dangerouslySetInnerHTML={{ __html: renderMd(bodyMd) }}
        />

        {error && <FormBanner kind="error">{error}</FormBanner>}

        <form onSubmit={submit} className="space-y-4 border-t border-border pt-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5"
              checked={publishName}
              onChange={(e) => setPublishName(e.target.checked)}
            />
            <span>Согласен на публичное размещение моего имени и фамилии.</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5"
              checked={publishStats}
              onChange={(e) => setPublishStats(e.target.checked)}
            />
            <span>
              Согласен на публичное отображение индивидуальной игровой статистики с
              привязкой к моему имени.
            </span>
          </label>

          <div>
            <Label htmlFor="alias">Публичный псевдоним (необязательно)</Label>
            <Input
              id="alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Если не хотите показывать ФИО"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Кто подписывает</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="signer" checked={signer === "self"} onChange={() => setSigner("self")} />
              Я сам(а) (игрок)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="signer" checked={signer === "legal_guardian"} onChange={() => setSigner("legal_guardian")} />
              Законный представитель несовершеннолетнего
            </label>
          </fieldset>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Сохранение…" : "Подтвердить выбор"}
          </Button>
          <p className="text-center text-xs text-muted">
            Галочки не отмечены по умолчанию. Вы можете ничего не разрешать и всё
            равно участвовать под нейтральным обозначением.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
