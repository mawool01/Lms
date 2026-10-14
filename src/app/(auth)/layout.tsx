import { getBranding } from "@/lib/branding";
import { BrandLogo } from "@/components/brand";
import { Markdown } from "@/components/markdown";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const b = await getBranding();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100 px-4 py-10 dark:from-slate-950 dark:via-slate-950 dark:to-brand-950">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo branding={b} className="h-14 max-w-[220px] min-w-14" />
          <h1 className="mt-3 text-2xl font-bold">{b.siteName}</h1>
          {b.tagline && <p className="muted text-sm">{b.tagline}</p>}
        </div>
        {b.loginMessage && (
          <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm dark:border-brand-900 dark:bg-brand-950/40">
            <Markdown>{b.loginMessage}</Markdown>
          </div>
        )}
        <div className="card p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
