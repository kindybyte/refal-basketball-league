// All times are shown in Bishkek time (UTC+6, no DST) regardless of where the
// code runs — server (often UTC) or the viewer's browser. This keeps match
// times consistent everywhere.
const TZ = "Asia/Bishkek";

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: TZ,
});
const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});
const timeFmt = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});
const weekdayFmt = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: TZ });

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
