import Link from "next/link";

const navLinks = [
  { href: "/schedule", label: "Расписание" },
  { href: "/matches", label: "Матчи" },
  { href: "/standings", label: "Таблица" },
  { href: "/teams", label: "Команды" },
  { href: "/stats", label: "Статистика" },
  { href: "/bracket", label: "Плей-офф" },
];

/** REFAL wordmark — a simple, self-contained logo (no external asset). */
export function RefalLogo({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-base font-black text-accent-fg shadow-sm ${className ?? ""}`}
      style={{ background: "linear-gradient(135deg, var(--color-accent), var(--color-accent-2))" }}
    >
      R
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <RefalLogo />
          <span className="text-sm font-black tracking-tight">
            REFAL <span className="font-semibold text-muted">League</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm md:flex">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
