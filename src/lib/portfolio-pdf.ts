import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Portfolio } from "./portfolio";
import { ITEM_TYPES, ITEM_TYPE_ORDER, itemDates } from "./portfolio-meta";
import { certState } from "./certifications/status";
import { formatDate } from "./utils";

const BRAND = rgb(0.145, 0.278, 0.918);
const DARK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const GREEN = rgb(0.02, 0.5, 0.33);

/** Plain-text version of markdown for the PDF. */
const plain = (md: string) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
// Standard PDF fonts only cover WinAnsi characters.
const clean = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

/** Renders an ICLCA transcript: verified records first, then self-reported items, paginated on US Letter. */
export async function renderTranscriptPdf(p: Portfolio, url: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`ICLCA Transcript — ${p.user.name}`);
  pdf.setAuthor("ICLCA");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 20) newPage();
  };
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const words = clean(text).split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const text = (t: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const { font = regular, size = 10, color = DARK, indent = 0, gap = 3 } = opts;
    for (const line of wrap(t, font, size, W - 2 * M - indent)) {
      ensure(size + gap);
      page.drawText(line, { x: M + indent, y: y - size, size, font, color });
      y -= size + gap;
    }
  };
  const heading = (t: string) => {
    ensure(40);
    y -= 12;
    page.drawText(clean(t).toUpperCase(), { x: M, y: y - 11, size: 11, font: bold, color: BRAND });
    y -= 16;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: BRAND });
    y -= 8;
  };
  const tag = (verified: boolean) => (verified ? "[Verified by ICLCA]" : "[Self-reported]");

  // Header
  page.drawText("INTERNATIONAL COLLEGE LEARNING CENTER ASSOCIATION", { x: M, y: y - 10, size: 9, font: bold, color: BRAND });
  y -= 30;
  text(`Transcript of ${p.user.name}`, { font: bold, size: 20 });
  const sub = [p.user.portfolioHeadline, [p.user.jobTitle, p.user.institution].filter(Boolean).join(", ")].filter(Boolean).join(" - ");
  if (sub) text(sub, { size: 11, color: MUTED });
  if (p.user.waIsMember && p.user.waMembershipLevel) text(`ICLCA member: ${p.user.waMembershipLevel}${p.user.waMembershipStatus ? ` (${p.user.waMembershipStatus})` : ""}`, { size: 10, color: MUTED });
  text(`Generated ${formatDate(new Date(), { dateStyle: "long" })} · ${url}`, { size: 8, color: MUTED });

  if (p.certifications.length) {
    heading("ICLCA certifications");
    for (const c of p.certifications) {
      const state = certState(c);
      text(`${c.program.name} - ${c.level.name}`, { font: bold });
      if (c.centerName) text(`${c.centerName}${c.institution ? `, ${c.institution}` : ""}`, { indent: 10 });
      text(
        `Issued ${formatDate(c.issuedAt)} · ${c.expiresAt ? `${state === "expired" ? "Expired" : "Valid until"} ${formatDate(c.expiresAt)}` : "Lifetime"} · Verification code ${c.code} ${tag(true)}`,
        { indent: 10, size: 9, color: GREEN, gap: 8 },
      );
    }
  }
  if (p.courses.length) {
    heading("ICLCA courses completed");
    for (const c of p.courses) text(`${c.title} (${c.code}) - completed ${formatDate(c.completedAt)} ${tag(true)}`, { gap: 5 });
  }
  for (const type of ITEM_TYPE_ORDER) {
    const items = p.byType[type];
    if (!items.length) continue;
    const meta = ITEM_TYPES[type];
    const hours = type === "PROFESSIONAL_DEVELOPMENT" ? items.reduce((s, i) => s + (i.hours ?? 0), 0) : 0;
    heading(hours ? `${meta.label} (${hours} hours)` : meta.label);
    for (const item of items) {
      text(item.title, { font: bold });
      const details = [item.role, item.organization, item.location, itemDates(item, meta.dates), item.hours ? `${item.hours} hours` : null].filter(Boolean).join(" · ");
      if (details) text(details, { indent: 10, size: 9, color: MUTED });
      if (item.description) text(plain(item.description).slice(0, 600), { indent: 10, size: 9 });
      text(tag(item.verification === "VERIFIED"), { indent: 10, size: 8, color: item.verification === "VERIFIED" ? GREEN : MUTED, gap: 8 });
    }
  }
  if (p.user.portfolioShowBadges && (p.badges.length || p.points)) {
    heading("Learning achievements");
    text(`${p.points.toLocaleString()} points · Level ${p.level.level} (${p.level.name})${p.badges.length ? ` · Badges: ${p.badges.map((b) => b.badge.name).join(", ")}` : ""} ${tag(true)}`);
  }

  // Footer on every page
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    const footer = clean(`Items marked "Verified by ICLCA" are confirmed by ICLCA records; others are self-reported.   Page ${i + 1} of ${pages.length}`);
    pg.drawText(footer, { x: M, y: M - 20, size: 7, font: regular, color: MUTED });
  });
  return pdf.save();
}
