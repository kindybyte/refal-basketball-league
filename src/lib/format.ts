const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});
const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});
const weekdayFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return dateFmt.format(new Date(iso));
}
export function formatDateTime(iso: string | null): string {
  if (!iso) return "Дата уточняется";
  return dateTimeFmt.format(new Date(iso));
}
export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return timeFmt.format(new Date(iso));
}
export function formatWeekday(iso: string | null): string {
  if (!iso) return "";
  return weekdayFmt.format(new Date(iso));
}

const statusLabels: Record<string, string> = {
  upcoming: "Скоро",
  ongoing: "Идёт",
  completed: "Завершён",
  archived: "В архиве",
  scheduled: "По расписанию",
  live: "В эфире",
  pending_confirmation: "Ожидает подтверждения",
  postponed: "Перенесён",
  cancelled: "Отменён",
};
export function statusLabel(s: string): string {
  return statusLabels[s] ?? s;
}

const stageLabels: Record<string, string> = {
  round_robin: "Круговой этап",
  group: "Групповой этап",
  quarterfinal: "Четвертьфинал",
  semifinal: "Полуфинал",
  final: "Финал",
  third_place: "Матч за 3-е место",
};
export function stageLabel(s: string): string {
  return stageLabels[s] ?? s;
}
