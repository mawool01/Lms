import Link from "next/link";
import { getBranding } from "@/lib/branding";
import { ActionForm, SubmitButton } from "@/components/forms";
import { loginAction } from "@/lib/actions/auth";
import { waEnabled } from "@/lib/wildapricot";
import { WildApricotButton } from "@/components/wa-button";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const org = (await getBranding()).shortName;
  return (
    <>
      <h2 className="mb-6 text-xl font-semibold">Sign in</h2>
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {waEnabled() && (
        <>
          <WildApricotButton next={next} />
          <p className="muted mt-2 text-center text-xs">{org} members and contacts: use your Wild Apricot login.</p>
          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />or sign in with email<span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>
        </>
      )}
      <ActionForm action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      {process.env.ALLOW_SIGNUP !== "false" && (
        <p className="muted mt-6 text-center text-sm">
          New here? <Link href="/signup" className="link">Create an account</Link>
        </p>
      )}
    </>
  );
}
