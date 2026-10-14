import type { MetadataRoute } from "next";
import { brandingColors, getBranding } from "@/lib/branding";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getBranding();
  return {
    name: b.siteName,
    short_name: b.shortName,
    description: `The ${b.shortName} learning management system`,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: brandingColors(b).primary,
    icons: b.logoUrl ? [{ src: b.logoUrl, sizes: "any" }] : [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
