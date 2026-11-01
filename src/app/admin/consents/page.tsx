import { requireAdmin } from "@/lib/guards";
import { InProgress } from "@/components/admin/in-progress";

export const metadata = { title: "Согласия" };

export default async function Page() {
  await requireAdmin();
  return (
    <InProgress
      title="Согласия и запросы"
      note="Обзор согласий, отзыв и обработка запросов субъектов данных. Выдача ссылок согласия уже доступна на странице «Игроки»."
    />
  );
}
