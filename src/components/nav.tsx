"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/auth";
import { BrandLogo } from "@/components/brand";

type NavItem = { href: string; label: string; icon: string; badge?: number; mobile?: boolean };

export function AppNav({
  user,
  unread,
  branding,
}: {
  branding: { siteName: string; shortName: string; logoUrl: string | null };
  user: { name: string; role: "ADMIN" | "TEACHER" | "STUDENT"; avatarUrl: string | null };
  unread: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "🏠", mobile: true },
    { href: "/courses", label: "Courses", icon: "📘", mobile: true },
    { href: "/catalog", label: "Learning Center", icon: "🧭" },
    { href: "/messages", label: "Messages", icon: "💬", badge: unread, mobile: true },
    { href: "/leaderboard", label: "Leaderboard", icon: "🏆", mobile: true },
    { href: "/certifications", label: "Certifications", icon: "🎖️" },
    { href: "/portfolio", label: "Portfolio", icon: "🗂️" },
    { href: "/profile", label: "Profile", icon: "👤" },
  ];
  if (user.role !== "STUDENT") items.splice(3, 0, { href: "/rubrics", label: "Rubrics", icon: "📏" });
  if (user.role === "ADMIN") {
    items.push({ href: "/admin", label: "Admin", icon: "🛠️" });
  }
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const links = (onClick?: () => void) =>
    items.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
          isActive(item.href)
            ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
        )}
      >
        <span className="text-base">{item.icon}</span>
        <span className="flex-1">{item.label}</span>
        {!!item.badge && <span className="rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">{item.badge}</span>}
      </Link>
    ));

  const footer = (
    <div className="border-t border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center gap-3 px-2 py-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="muted text-xs capitalize">{user.role.toLowerCase()}</p>
        </div>
        <form action={logoutAction}>
          <button className="btn-ghost btn-sm" title="Sign out">Sign out</button>
        </form>
      </div>
    </div>
  );

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-2 font-bold">
      <BrandLogo branding={branding} />
      <span className="truncate">{branding.siteName}</span>
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center px-5">{brand}</div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">{links()}</nav>
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/90">
        {brand}
        <button className="btn-ghost btn-sm text-lg" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex h-14 items-center justify-between px-4">
              <span className="font-semibold">Menu</span>
              <button className="btn-ghost btn-sm text-lg" onClick={() => setOpen(false)} aria-label="Close menu">✕</button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3">{links(() => setOpen(false))}</nav>
            {footer}
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-slate-800 dark:bg-slate-900">
        {items
          .filter((i) => i.mobile)
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive(item.href) ? "text-brand-600 dark:text-brand-400" : "text-slate-500",
              )}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
              {!!item.badge && <span className="absolute top-1 right-1/4 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{item.badge}</span>}
            </Link>
          ))}
      </nav>
    </>
  );
}
