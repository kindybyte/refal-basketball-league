"use client";

import { useEffect, useState } from "react";

function diff(target: number) {
  const ms = Math.max(0, target - Date.now());
  const totalSec = Math.floor(ms / 1000);
  return {
    done: ms === 0,
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

/** Countdown to the next match (spec §4). Renders a stable placeholder on the
 *  server to avoid hydration mismatch, then ticks client-side. */
export function Countdown({ iso }: { iso: string }) {
  const target = new Date(iso).getTime();
  const [t, setT] = useState(() => diff(target));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setT(diff(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!mounted) {
    return <span className="tabular-nums text-muted">—</span>;
  }
  if (t.done) {
    return <span className="font-semibold text-live">Начинается</span>;
  }

  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    <span className="tabular-nums font-semibold" aria-live="polite">
      {t.days > 0 && `${t.days} д `}
      {pad(t.hours)}:{pad(t.minutes)}:{pad(t.seconds)}
    </span>
  );
}
