import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import { brandingCss, getBranding } from "@/lib/branding";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  const icon = b.faviconUrl || b.logoUrl || "/icon.svg";
  return {
    title: { default: b.siteName, template: `%s · ${b.siteName}` },
    description: `The ${b.shortName} learning management system`,
    appleWebApp: { capable: true, title: b.siteName, statusBarStyle: "default" },
    icons: { icon, apple: b.logoUrl || icon },
  };
}

export function generateViewport(): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
      { media: "(prefers-color-scheme: dark)", color: "#020617" },
    ],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, branding] = await Promise.all([getCurrentUser(), getBranding()]);
  // data-theme carries all three choices ("system" | "light" | "dark") and
  // globals.css resolves them, so "Light" renders differently from "Match my
  // device" rather than identically to it.
  const theme = (user?.theme ?? "SYSTEM").toLowerCase();
  return (
    <html lang="en" data-theme={theme} className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Admin-chosen brand colors (Admin → Branding) override the default palette. */}
        <style id="brand-colors" dangerouslySetInnerHTML={{ __html: brandingCss(branding) }} />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
