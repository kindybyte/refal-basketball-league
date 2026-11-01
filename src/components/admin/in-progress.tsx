import { Card, CardContent } from "@/components/ui/card";

export function InProgress({ title, note }: { title: string; note?: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <Card className="border-dashed">
        <CardContent className="p-6 text-sm text-muted">
          <p className="font-medium text-foreground">Раздел в разработке</p>
          <p className="mt-1">
            {note ??
              "Эта часть панели готовится в следующем этапе. Основные данные уже доступны через базу и публичный сайт."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
