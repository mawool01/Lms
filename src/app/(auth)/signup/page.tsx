import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { signupAction } from "@/lib/actions/auth";
import { waEnabled } from "@/lib/wildapricot";
import { WildApricotButton } from "@/components/wa-button";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  if (process.env.ALLOW_SIGNUP === "false") {
    return (
      <div className="space-y-4 text-center">
        {waEnabled() && <WildApricotButton label="Continue with Wild Apricot" />}
        <p>
          {waEnabled() ? "Or ask" : "Self sign-up is disabled. Please ask"} an ICLCA administrator for an account. <Link href="/login" className="link">Sign in</Link>
        </p>
      </div>
    );
  }
  return (
    <>
      <h2 className="mb-2 text-xl font-semibold">Create your account</h2>
      <p className="muted mb-6 text-sm">For ICLCA courses and for applying to ICLCA certifications (LCLC and Learning Centers of Excellence).</p>
      {waEnabled() && (
        <div className="mb-6">
          <WildApricotButton label="Continue with Wild Apricot" />
          <p className="muted mt-2 text-center text-xs">Have an ICLCA (Wild Apricot) login? Use it — no new password needed.</p>
        </div>
      )}
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
