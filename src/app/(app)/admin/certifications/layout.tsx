import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { CertAdminTabs } from "@/components/cert/admin-tabs";
import { PageHeader } from "@/components/ui";

export default async function CertAdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN");
  return (
    <>
      <PageHeader title="Certifications" subtitle="Applications, reviews, certified professionals and centers." actions={<Link href="/admin" className="btn-secondary">← Admin</Link>} />
      <CertAdminTabs />
      {children}
    </>
  );
}
