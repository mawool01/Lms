import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/certifications/email";
import { renderCertificatePdf } from "@/lib/certifications/pdf";

/** Certificate PDF: available to the holder and to admins. */
export async function GET(_req: Request, { params }: { params: Promise<{ certificationId: string }> }) {
  const { certificationId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", appUrl()));
  const cert = await db.certification.findUnique({ where: { id: certificationId }, include: { program: true, level: true } });
  if (!cert || (cert.holderId !== user.id && user.role !== "ADMIN")) return new NextResponse("Not found", { status: 404 });
  if (cert.revokedAt) return new NextResponse("This certification has been revoked.", { status: 410 });

  const bytes = await renderCertificatePdf({
    code: cert.code,
    holderName: cert.holderName,
    centerName: cert.centerName,
    institution: cert.institution,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
    programName: cert.program.name,
    levelName: cert.level.name,
    isCenter: cert.program.kind === "CENTER",
    verifyUrl: appUrl(`/verify/${cert.code}`),
  });
  const name = (cert.centerName ?? cert.holderName).replace(/[^\w]+/g, "-");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ICLCA-${cert.code}-${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
