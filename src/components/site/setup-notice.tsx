import { Card, CardContent } from "@/components/ui/card";

/** Shown on public pages when Supabase keys are not configured yet. */
export function SetupNotice() {
  return (
    <Card className="border-dashed">
      <CardContent className="space-y-2 text-sm">
        <p className="font-semibold">Подключение к базе данных не настроено</p>
        <p className="text-muted">
          Скопируйте{" "}
          <code className="rounded bg-surface-2 px-1">.env.local.example</code> в{" "}
          <code className="rounded bg-surface-2 px-1">.env.local</code> и укажите
          ключи проекта Supabase, затем примените миграции из папки{" "}
          <code className="rounded bg-surface-2 px-1">supabase/migrations</code>.
          Подробности — в{" "}
          <code className="rounded bg-surface-2 px-1">README.md</code>.
        </p>
      </CardContent>
    </Card>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}
