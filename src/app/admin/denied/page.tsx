import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Доступ запрещён" };

export default function DeniedPage() {
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="space-y-3 p-6 text-center">
        <h1 className="text-lg font-bold">Недостаточно прав</h1>
        <p className="text-sm text-muted">
          У вашей учётной записи нет доступа к этому разделу. Если вы оператор,
          откройте назначенный вам матч в разделе «Мои матчи».
        </p>
        <Link href="/admin" className="text-sm text-accent underline">
          Вернуться
        </Link>
      </CardContent>
    </Card>
  );
}
