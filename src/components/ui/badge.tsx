import { cn } from "@/lib/utils";

type Variant = "default" | "accent" | "live" | "muted" | "outline" | "demo";

const variants: Record<Variant, string> = {
  default: "bg-surface-2 text-foreground",
  accent: "bg-accent text-accent-fg",
  live: "bg-live text-white",
  muted: "bg-surface-2 text-muted",
  outline: "border border-border text-muted",
  demo: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Small animated LIVE pill (red, spec §4). */
export function LiveBadge({ className }: { className?: string }) {
  return (
    <Badge variant="live" className={cn("uppercase", className)}>
      <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
      LIVE
    </Badge>
  );
}

/** Marks demonstration data explicitly (spec §17). */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge variant="demo" className={className}>
      ДЕМО
    </Badge>
  );
}
