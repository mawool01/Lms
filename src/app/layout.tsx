import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "ICLCA Learning", template: "%s · ICLCA Learning" },
  description: "The ICLCA learning management system",
  appleWebApp: { capable: true, title: "ICLCA Learning", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const theme = user?.theme ?? "SYSTEM";
  return (
    <html lang="en" className={`${inter.variable} ${theme === "DARK" ? "dark" : ""}`} suppressHydrationWarning>
      <head>
        {theme === "SYSTEM" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')`,
            }}
          />
        )}
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
