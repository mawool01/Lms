import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { DEFAULT_BRANDING, type Branding } from "./branding-defaults";
import { brandScale, scaleCss } from "./color";
import { appUrl } from "./app-url";

export { DEFAULT_BRANDING, type Branding };

/** Private Blob URLs can't be opened by browsers; serve them through this app's /files route instead. */
function servable(url: string | null) {
  if (!url) return url;
  try {
    const u = new URL(url);
    return u.hostname.endsWith(".private.blob.vercel-storage.com") ? appUrl(`/files${u.pathname}`) : url;
  } catch {
    return url;
  }
}

/** Site branding, cached until an admin saves changes (tag "branding"). */
export const getBranding = unstable_cache(
  async (): Promise<Branding> => {
    try {
      const row = await db.siteSettings.findUnique({ where: { id: "site" } });
      if (!row) return DEFAULT_BRANDING;
      return {
        siteName: row.siteName,
        shortName: row.shortName,
        orgName: row.orgName,
        tagline: row.tagline,
        loginMessage: row.loginMessage,
        primaryColor: row.primaryColor,
        accentColor: row.accentColor,
        logoUrl: servable(row.logoUrl),
        faviconUrl: servable(row.faviconUrl),
      };
    } catch {
      return DEFAULT_BRANDING; // e.g. before migrations have run
    }
  },
  ["branding"],
  { tags: ["branding"] },
);

/** CSS that re-themes the whole app: Tailwind utilities read these variables. */
export function brandingCss(b: Branding) {
  const brand = brandScale(b.primaryColor).scale;
  const accent = brandScale(b.accentColor).scale;
  return `:root{${scaleCss("brand", brand)}${scaleCss("accent", accent)}}`;
}

/** Hex → pdf-lib friendly 0–1 RGB triple. */
export function rgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The readable (possibly darkened) primary and accent shades used for PDFs and emails. */
export function brandingColors(b: Branding) {
  return { primary: brandScale(b.primaryColor).scale[600], accent: brandScale(b.accentColor).scale[500] };
}
