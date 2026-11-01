import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site/site-header";
import { BottomNav } from "@/components/site/bottom-nav";

export const metadata: Metadata = {
  title: {
    default: "REFAL Basketball League",
    template: "%s — REFAL Basketball League",
  },
  description:
    "Баскетбольный турнир на площадке «Рефал», Бишкек. Расписание, результаты, LIVE, турнирная таблица и статистика.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e8793a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="h-full">
      <body className="flex min-h-full flex-col bg-background">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
