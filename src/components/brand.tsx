import type { Branding } from "@/lib/branding-defaults";
import { cn } from "@/lib/utils";

/** The site logo: the uploaded image, or the default mark tinted with the brand color. */
export function BrandLogo({ branding, className = "h-8 w-8" }: { branding: Pick<Branding, "logoUrl" | "shortName">; className?: string }) {
  if (branding.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={branding.logoUrl} alt={`${branding.shortName} logo`} className={cn(className, "object-contain")} />;
  }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" className="fill-brand-600" />
      <path d="M32 14 8 26l24 12 18-9v13h4V26L32 14Zm-14 21v9c0 3 6 7 14 7s14-4 14-7v-9l-14 7-14-7Z" fill="#fff" />
    </svg>
  );
}
