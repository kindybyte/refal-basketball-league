import Link from "next/link";
import { requireAppUser } from "@/lib/guards";
import { signOutAction } from "@/lib/actions/auth";
import { AdminNav } from "./admin-nav";
import { RefalLogo } from "@/components/site/site-header";
import { Badge } from "@/components/ui/badge";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layout-level gate: must be a signed-in app user. Each page additionally
  // enforces its specific role (requireAdmin / requireMatchController).
  const user = await requireAppUser();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/admin" className="flex items-center gap-2">
            <RefalLogo />
            <span className="text-sm font-bold">Панель управления</span>
            <Badge variant={user.role === "admin" ? "accent" : "muted"}>
              {user.role === "admin" ? "Администратор" : "Оператор"}
            </Badge>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">
              {user.fullName}
            </span>
            <Link href="/" className="text-xs text-muted hover:text-foreground">
              На сайт
            </Link>
            <form action={signOutAction}>
              <button className="text-xs text-muted hover:text-live">Выйти</button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row">
        <aside className="md:w-56 md:shrink-0">
          <AdminNav role={user.role} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
