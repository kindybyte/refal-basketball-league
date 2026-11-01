"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCircle,
  CalendarRange,
  Trophy,
  ShieldCheck,
  Radio,
  ScrollText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/db-types";

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const adminLinks: NavLink[] = [
  { href: "/admin", label: "Обзор", icon: LayoutDashboard, exact: true },
  { href: "/admin/teams", label: "Команды", icon: Users },
  { href: "/admin/players", label: "Игроки", icon: UserCircle },
  { href: "/admin/schedule", label: "Расписание", icon: CalendarRange },
  { href: "/admin/matches", label: "Матчи", icon: Trophy },
  { href: "/admin/consents", label: "Согласия", icon: ShieldCheck },
  { href: "/admin/operators", label: "Операторы", icon: Radio },
  { href: "/admin/audit", label: "Журнал", icon: ScrollText },
  { href: "/admin/settings", label: "Настройки", icon: Settings },
];

const operatorLinks: NavLink[] = [
  { href: "/admin/matches", label: "Мои матчи", icon: Trophy },
];

export function AdminNav({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const links = role === "admin" ? adminLinks : operatorLinks;

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border pb-2 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:pb-0 md:pr-3">
      {links.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            data-tap
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm",
              active
                ? "bg-accent/10 font-semibold text-accent"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
