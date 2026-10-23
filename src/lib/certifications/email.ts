import "server-only";
import { brandingColors, getBranding } from "@/lib/branding";
import { appUrl } from "@/lib/app-url";

export { appUrl };

/**
 * Optional email delivery through Resend (https://resend.com). Configure
 * RESEND_API_KEY and EMAIL_FROM (e.g. "ICLCA <certifications@yourdomain.org>").
 * Without them, emails are skipped and everything else still works.
 */
export const emailEnabled = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function sendEmail(to: string, subject: string, lines: string[], link?: { href: string; label: string }) {
  if (!emailEnabled()) return false;
  const b = await getBranding();
  const color = brandingColors(b).primary;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#0f172a">
${b.logoUrl ? `<img src="${escape(b.logoUrl)}" alt="" style="max-height:48px;max-width:200px">` : ""}
<h2 style="color:${color}">${escape(b.siteName)}</h2>
${lines.map((l) => `<p>${escape(l)}</p>`).join("")}
${link ? `<p><a href="${escape(link.href)}" style="display:inline-block;background:${color};color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escape(link.label)}</a></p>` : ""}
</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html, text: [...lines, link?.href ?? ""].join("\n\n") }),
    });
    if (!res.ok) console.error("Email failed", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("Email failed", e);
    return false;
  }
}
