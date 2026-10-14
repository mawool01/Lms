"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";

export function CertAdminTabs() {
  const pathname = usePathname();
  const base = "/admin/certifications";
  const items = [
    { key: "applications", label: "Applications", href: base },
    { key: "registry", label: "Certified registry", href: `${base}/registry` },
    { key: "programs", label: "Programs & criteria", href: `${base}/programs` },
    { key: "reviewers", label: "Reviewers", href: `${base}/reviewers` },
  ];
  const segment = pathname.slice(base.length).split("/")[1] ?? "";
  return <Tabs items={items} active={segment === "" || segment === "applications" ? "applications" : segment} />;
}
