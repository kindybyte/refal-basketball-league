import { requireAdmin } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import { OperatorsManager } from "./operators-manager";

export const metadata = { title: "Операторы" };

export default async function AdminOperatorsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: operators } = await supabase
    .from("app_users")
    .select("id, full_name, status")
    .eq("role", "operator")
    .order("full_name");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Операторы</h1>
      <OperatorsManager operators={operators ?? []} />
    </div>
  );
}
