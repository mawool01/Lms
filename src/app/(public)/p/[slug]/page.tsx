import type { Metadata } from "next";
import { getBranding } from "@/lib/branding";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadPortfolio } from "@/lib/portfolio";
import { PortfolioView } from "@/components/portfolio/portfolio-view";
import { PrintButton } from "@/components/portfolio/print-button";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await loadPortfolio(slug, await getCurrentUser());
  if (!p) return { title: "Portfolio not found", robots: { index: false } };
  const org = (await getBranding()).shortName;
  const description = p.user.portfolioHeadline ?? `${org} portfolio of ${p.user.name}`;
  return {
    title: `${p.user.name} — ${org} Portfolio`,
    description,
    // Only public portfolios may be indexed by search engines.
    robots: p.user.portfolioVisibility === "PUBLIC" ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { title: `${p.user.name} — ${org} Portfolio`, description, type: "profile" },
  };
}

export default async function PortfolioPage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getCurrentUser();
  const p = await loadPortfolio(slug, viewer);
  if (!p) notFound();
  const org = (await getBranding()).shortName;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap gap-2">
          {p.isOwner && <Link href="/portfolio" className="btn-primary btn-sm">✏️ Edit my portfolio</Link>}
          {p.user.portfolioVisibility === "PRIVATE" && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">🔒 Private — only you and admins can see this</span>}
        </div>
        <div className="flex gap-2">
          <a href={`/p/${slug}/transcript.pdf`} className="btn-secondary btn-sm">⬇ Transcript (PDF)</a>
          <PrintButton />
        </div>
      </div>
      <div className="card p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <PortfolioView p={p} org={org} />
      </div>
      <p className="muted mt-6 text-center text-xs">
        {org} portfolio · Items marked “Verified by {org}” are confirmed by {org} records; other items are self-reported.
      </p>
    </div>
  );
}
