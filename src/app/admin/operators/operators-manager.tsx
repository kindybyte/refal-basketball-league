"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FormBanner } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import {
  inviteOperatorAction,
  disableOperatorAction,
} from "@/lib/actions/operators";

interface Operator {
  id: string;
  full_name: string;
  status: string;
}

export function OperatorsManager({ operators }: { operators: Operator[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "error" | "success"; msg: string } | null>(null);

  function invite(formData: FormData) {
    startTransition(async () => {
      const res = await inviteOperatorAction(formData);
      if (res.ok) {
        setBanner({ kind: "success", msg: "Оператор создан. Передайте ему email и пароль лично." });
        router.refresh();
      } else {
        setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
      }
    });
  }

  function disable(id: string) {
    if (!confirm("Отключить оператора? Он потеряет доступ.")) return;
    startTransition(async () => {
      const res = await disableOperatorAction(id);
      if (res.ok) { router.refresh(); setBanner({ kind: "success", msg: "Оператор отключён" }); }
      else setBanner({ kind: "error", msg: res.error ?? "Ошибка" });
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="self-start">
        <CardContent className="p-4">
          <h2 className="mb-3 font-semibold">Пригласить оператора</h2>
          {banner && <div className="mb-3"><FormBanner kind={banner.kind}>{banner.msg}</FormBanner></div>}
          <form action={invite} className="space-y-3" key={operators.length}>
            <div>
              <Label htmlFor="full_name">Имя</Label>
              <Input id="full_name" name="full_name" required />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="password">Временный пароль</Label>
              <Input id="password" name="password" type="text" required minLength={8} placeholder="не короче 8 символов" />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Создание…" : "Создать оператора"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted">
            Операторы входят только по приглашению. Оператор не видит контакты
            игроков и не может менять чужие матчи — это проверяется на уровне базы.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="font-semibold">Операторы ({operators.length})</h2>
        {operators.length === 0 && <p className="text-sm text-muted">Пока нет операторов.</p>}
        {operators.map((o) => (
          <Card key={o.id}>
            <CardContent className="flex items-center justify-between gap-2 p-3">
              <div>
                <div className="text-sm font-medium">{o.full_name}</div>
                <Badge variant={o.status === "active" ? "accent" : "muted"}>
                  {o.status === "active" ? "активен" : "отключён"}
                </Badge>
              </div>
              {o.status === "active" && (
                <Button size="sm" variant="danger" onClick={() => disable(o.id)} disabled={pending}>
                  Отключить
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
