import { requireAdmin } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Журнал действий" };

export default async function Page() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action, entity_type, summary, created_at, actor_role")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Журнал административных действий</h1>
      {(!logs || logs.length === 0) && (
        <p className="text-sm text-muted">Записей пока нет.</p>
      )}
      <div className="space-y-2">
        {(logs ?? []).map((l) => (
          <Card key={l.id}>
            <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{l.summary ?? l.action}</div>
                <div className="text-xs text-muted">
                  {l.action} · {l.entity_type ?? "—"} · {l.actor_role ?? "—"}
                </div>
              </div>
              <time className="shrink-0 text-xs text-muted">
                {new Date(l.created_at).toLocaleString("ru-RU")}
              </time>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
