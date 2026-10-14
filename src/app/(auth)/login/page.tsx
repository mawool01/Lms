import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { loginAction } from "@/lib/actions/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h2 className="mb-6 text-xl font-semibold">Sign in</h2>
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
