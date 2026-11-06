import { teamLogoUrl } from "@/lib/utils";

/**
 * Team avatar: shows the uploaded logo when present, otherwise the short name
 * on a subtle gradient derived from the team colour.
 */
export function TeamAvatar({
  name,
  short,
  color,
  logoPath,
  size = 48,
  className = "",
}: {
  name?: string | null;
  short?: string | null;
  color?: string | null;
  logoPath?: string | null;
  size?: number;
  className?: string;
}) {
  const url = teamLogoUrl(logoPath);
  const c = color ?? "#71717a";
  const label = (short ?? name ?? "?").slice(0, 3).toUpperCase();
  const fontSize = Math.round(size * 0.34);

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? short ?? "Логотип команды"}
        width={size}
        height={size}
        className={`shrink-0 rounded-full border border-border bg-surface object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-black text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize,
        background: `linear-gradient(135deg, ${c}, ${c}cc)`,
      }}
      aria-hidden
    >
      {label}
    </span>
  );
}
