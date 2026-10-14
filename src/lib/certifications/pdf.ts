import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { pdfBranding } from "@/lib/pdf-branding";
import { formatDate } from "@/lib/utils";

const DARK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);

/** Renders a landscape US-Letter certificate. */
export async function renderCertificatePdf(cert: {
  code: string;
  holderName: string;
  centerName: string | null;
  institution: string | null;
  issuedAt: Date;
  expiresAt: Date | null;
  programName: string;
  levelName: string;
  isCenter: boolean;
  verifyUrl: string;
}) {
  const pdf = await PDFDocument.create();
  const { branding, primary: BRAND, accent: GOLD, logo } = await pdfBranding(pdf);
  pdf.setTitle(`${cert.programName} — ${cert.isCenter ? cert.centerName : cert.holderName}`);
  pdf.setAuthor(branding.orgName);
  const page = pdf.addPage([792, 612]);
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Borders
  page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40, borderColor: BRAND, borderWidth: 4 });
  page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: GOLD, borderWidth: 1.5 });

  // Standard fonts only cover WinAnsi; replace anything else so names never crash rendering.
  const clean = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
  const centered = (text: string, y: number, font = serif, size = 14, color = DARK) => {
    const t = clean(text);
    let s = size;
    while (font.widthOfTextAtSize(t, s) > width - 120 && s > 9) s -= 0.5;
    page.drawText(t, { x: (width - font.widthOfTextAtSize(t, s)) / 2, y, size: s, font, color });
    return t;
  };

  centered(branding.orgName.toUpperCase(), height - 90, sansBold, 13, BRAND);
  centered("Certificate of Certification", height - 145, serifBold, 38, DARK);
  centered("This certifies that", height - 195, serifItalic, 16, MUTED);
  if (cert.isCenter) {
    centered(cert.centerName ?? cert.holderName, height - 245, serifBold, 32, BRAND);
    if (cert.institution) centered(cert.institution, height - 275, serif, 16);
    centered(`under the direction of ${cert.holderName}`, height - 300, serifItalic, 13, MUTED);
  } else {
    centered(cert.holderName, height - 245, serifBold, 34, BRAND);
    if (cert.institution) centered(cert.institution, height - 275, serif, 16);
  }
  centered(cert.isCenter ? "has been awarded" : "has earned the", height - 335, serifItalic, 16, MUTED);
  centered(cert.programName, height - 368, serifBold, 22);
  centered(cert.levelName, height - 396, serif, 18, BRAND);

  // Footer: dates on the left, verification on the right
  const footY = 110;
  page.drawLine({ start: { x: 90, y: footY + 22 }, end: { x: 300, y: footY + 22 }, thickness: 0.8, color: MUTED });
  page.drawText(`Issued ${formatDate(cert.issuedAt, { dateStyle: "long" })}`, { x: 90, y: footY + 6, size: 11, font: sans, color: DARK });
  page.drawText(cert.expiresAt ? `Valid through ${formatDate(cert.expiresAt, { dateStyle: "long" })}` : "Lifetime certification", { x: 90, y: footY - 10, size: 11, font: sans, color: DARK });

  page.drawLine({ start: { x: width - 300, y: footY + 22 }, end: { x: width - 90, y: footY + 22 }, thickness: 0.8, color: MUTED });
  page.drawText(`Verification code: ${cert.code}`, { x: width - 300, y: footY + 6, size: 11, font: sansBold, color: DARK });
  const url = clean(cert.verifyUrl);
  let urlSize = 9;
  while (sans.widthOfTextAtSize(url, urlSize) > 210 && urlSize > 6) urlSize -= 0.5;
  page.drawText(url, { x: width - 300, y: footY - 10, size: urlSize, font: sans, color: BRAND });

  // Seal: the uploaded logo if it can be embedded, otherwise the short name in a ring.
  if (logo) {
    const dims = logo.scaleToFit(80, 60);
    page.drawImage(logo, { x: width / 2 - dims.width / 2, y: footY + 5 - dims.height / 2, width: dims.width, height: dims.height });
  } else {
    page.drawCircle({ x: width / 2, y: footY + 5, size: 34, borderColor: GOLD, borderWidth: 2, color: rgb(1, 0.98, 0.92) });
    const seal = clean(branding.shortName).slice(0, 10);
    let sealSize = 13;
    while (sansBold.widthOfTextAtSize(seal, sealSize) > 56 && sealSize > 6) sealSize -= 0.5;
    page.drawText(seal, { x: width / 2 - sansBold.widthOfTextAtSize(seal, sealSize) / 2, y: footY + 1, size: sealSize, font: sansBold, color: GOLD });
  }

  return pdf.save();
}
