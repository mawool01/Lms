import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadPortfolio, portfolioUrl } from "@/lib/portfolio";
import { renderTranscriptPdf } from "@/lib/portfolio-pdf";

/** Transcript PDF of a portfolio; same visibility rules as the portfolio page. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await loadPortfolio(slug, await getCurrentUser());
  if (!p) return new NextResponse("Not found", { status: 404 });
  const bytes = await renderTranscriptPdf(p, portfolioUrl(p.user.portfolioSlug!));
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ICLCA-transcript-${p.user.portfolioSlug}.pdf"`,
      "Cache-Control": "private, no-store",
      ...(p.user.portfolioVisibility === "PUBLIC" ? {} : { "X-Robots-Tag": "noindex" }),
    },
  });
}
