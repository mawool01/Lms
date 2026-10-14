import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white print:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href={user ? "/dashboard" : "/login"} className="flex items-center gap-2 font-bold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-8 w-8" />
            ICLCA Certifications
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/directory" className="btn-ghost btn-sm">Directory</Link>
            <Link href="/verify" className="btn-ghost btn-sm">Verify a certificate</Link>
            <Link href={user ? "/certifications" : "/signup"} className="btn-primary btn-sm">{user ? "My certifications" : "Apply"}</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
