import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { signupAction } from "@/lib/actions/auth";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  if (process.env.ALLOW_SIGNUP === "false") {
    return (
      <p className="text-center">
        Self sign-up is disabled. Please ask an ICLCA administrator for an account. <Link href="/login" className="link">Sign in</Link>
      </p>
    );
  }
  return (
    <>
      <h2 className="mb-6 text-xl font-semibold">Create your account</h2>
      <ActionForm action={signupAction} className="space-y-4">
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" name="name" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="Creating account…">Create account</SubmitButton>
      </ActionForm>
      <p className="muted mt-6 text-center text-sm">
        Already have an account? <Link href="/login" className="link">Sign in</Link>
      </p>
    </>
  );
}
