import Link from "next/link";
import type { ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cn("card p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="muted text-xs font-semibold tracking-wide uppercase">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}
    </div>
  );
}

const PILL_TONES = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  brand: "bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  yellow: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  accent: "bg-accent-100 text-accent-800 dark:bg-accent-900/40 dark:text-accent-200",
};

export function Pill({ children, tone = "gray" }: { children: ReactNode; tone?: keyof typeof PILL_TONES }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", PILL_TONES[tone])}>{children}</span>;
}

export function RolePill({ role }: { role: "ADMIN" | "TEACHER" | "STUDENT" }) {
  const tone = role === "ADMIN" ? "purple" : role === "TEACHER" ? "brand" : "gray";
  return <Pill tone={tone}>{role.charAt(0) + role.slice(1).toLowerCase()}</Pill>;
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span style={style} className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
      {initials(name)}
    </span>
  );
}

export function ProgressBar({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "green" }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", tone === "green" ? "bg-emerald-500" : "bg-brand-600")} style={{ width: `${v}%` }} />
    </div>
  );
}

export function EmptyState({ icon = "📭", title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700">
      <span className="text-4xl">{icon}</span>
      <p className="mt-3 font-semibold">{title}</p>
      {children && <div className="muted mt-1 max-w-md text-sm">{children}</div>}
    </div>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0 dark:border-slate-800">
      <ul className="flex min-w-max gap-1">
        {items.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              className={cn(
                "inline-block border-b-2 px-3 py-2.5 text-sm font-medium transition",
                t.key === active
                  ? "border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
