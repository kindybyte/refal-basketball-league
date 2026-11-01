"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  ListOrdered,
  Users,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/standings", label: "Таблица", icon: ListOrdered },
  { href: "/teams", label: "Команды", icon: Users },
  { href: "/stats", label: "Статистика", icon: BarChart3 },
];

export function BottomNav() {
  const pathname = usePathname();
  // Hidden inside the admin / operator console, which has its own chrome.
  if (pathname.startsWith("/admin") || pathname.startsWith("/login")) return null;

  return (
    <nav
      aria-label="Основная навигация"
      className="sticky bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                data-tap
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px]",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
