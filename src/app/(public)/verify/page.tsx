import { redirect } from "next/navigation";
import { getBranding } from "@/lib/branding";
import { normalizeCode } from "@/lib/certifications/status";
import { Card } from "@/components/ui";

export const metadata = { title: "Verify a certificate" };

async function lookup(formData: FormData) {
  "use server";
  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (code) redirect(`/verify/${encodeURIComponent(code)}`);
}

export default async function VerifyPage() {
  const org = (await getBranding()).shortName;
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-3xl font-bold">Verify a certificate</h1>
      <p className="muted mt-1 mb-6">Enter the verification code printed on an {org} certificate.</p>
      <Card>
        <form action={lookup} className="flex flex-col gap-2 sm:flex-row">
          <input name="code" placeholder="ICL-XXXX-XXXX" aria-label="Verification code" className="font-mono uppercase" required />
          <button className="btn-primary shrink-0">Verify</button>
        </form>
      </Card>
    </div>
  );
}
