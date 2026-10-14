import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { blobClientConfig } from "@/lib/blob";
import { resetBranding, saveBranding } from "@/lib/actions/branding";
import { BrandingForm } from "@/components/branding/branding-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Branding" };

export default async function BrandingPage() {
  await requireRole("ADMIN");
  const branding = await getBranding();
  return (
    <>
      <PageHeader
        title="Branding"
        subtitle="Change the site's name, colors and logo. Changes apply everywhere — including certificates, transcripts and emails."
        actions={
          <>
            <form action={resetBranding}>
              <button className="btn-ghost">Reset to defaults</button>
            </form>
            <Link href="/admin" className="btn-secondary">← Admin</Link>
          </>
        }
      />
      <BrandingForm action={saveBranding} initial={branding} blob={blobClientConfig()} />
    </>
  );
}
