import Link from "next/link";

/** Fields needed to decide whether a certification holder's name can link to their portfolio. */
export const HOLDER_PORTFOLIO_SELECT = { select: { portfolioSlug: true, portfolioVisibility: true, active: true } } as const;

type Holder = { portfolioSlug: string | null; portfolioVisibility: "PUBLIC" | "UNLISTED" | "PRIVATE"; active: boolean } | null;

/**
 * A holder's name, linked to their portfolio when they have one that others may see.
 * Private portfolios are never linked; unlisted ones are linked with rel="nofollow" so search engines skip them.
 * `staff` (admins) may link to any existing portfolio.
 */
export function HolderName({ name, holder, staff = false, className }: { name: string; holder: Holder; staff?: boolean; className?: string }) {
  if (!holder?.active || !holder.portfolioSlug || (holder.portfolioVisibility === "PRIVATE" && !staff)) return <span className={className}>{name}</span>;
  return (
    <Link
      href={`/p/${holder.portfolioSlug}`}
      className={`${className ?? ""} hover:underline`}
      title="View portfolio"
      rel={holder.portfolioVisibility === "PUBLIC" ? undefined : "nofollow"}
      prefetch={false}
    >
      {name}
    </Link>
  );
}
