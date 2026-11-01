import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <span className="text-5xl font-black text-accent">404</span>
      <p className="text-sm text-muted">Страница не найдена.</p>
      <Link
        href="/"
        className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg"
      >
        На главную
      </Link>
    </div>
  );
}
