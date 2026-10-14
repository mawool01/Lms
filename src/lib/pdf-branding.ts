import "server-only";
import { rgb, type PDFDocument, type PDFImage } from "pdf-lib";
import { brandingColors, getBranding, rgb01 } from "./branding";

/** Brand colors, names and (PNG/JPEG) logo prepared for pdf-lib documents. */
export async function pdfBranding(pdf: PDFDocument) {
  const b = await getBranding();
  const { primary, accent } = brandingColors(b);
  let logo: PDFImage | null = null;
  if (b.logoUrl) {
    try {
      const res = await fetch(b.logoUrl, { signal: AbortSignal.timeout(5000) });
      const type = res.headers.get("content-type") ?? "";
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (res.ok && (type.includes("png") || /\.png($|\?)/i.test(b.logoUrl))) logo = await pdf.embedPng(bytes);
      else if (res.ok && (type.includes("jpeg") || /\.jpe?g($|\?)/i.test(b.logoUrl))) logo = await pdf.embedJpg(bytes);
      // SVG/WebP/ICO logos can't be embedded in a PDF; the certificate falls back to the text seal.
    } catch {
      logo = null;
    }
  }
  return { branding: b, primary: rgb(...rgb01(primary)), accent: rgb(...rgb01(accent)), logo };
}
