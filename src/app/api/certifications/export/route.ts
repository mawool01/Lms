import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CERT_STATE_LABELS, certState } from "@/lib/certifications/status";
import { registryWhere } from "@/lib/certifications/registry";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const certs = await db.certification.findMany({ where: registryWhere(params), include: { program: true, level: true }, orderBy: { issuedAt: "desc" } });
  const rows = [
    ["Code", "Program", "Level", "Holder", "Email", "Institution", "Center", "Issued", "Expires", "Status", "Renewal", "In directory"],
    ...certs.map((c) => [c.code, c.program.name, c.level.name, c.holderName, c.holderEmail, c.institution, c.centerName, day(c.issuedAt), c.expiresAt ? day(c.expiresAt) : "Lifetime", CERT_STATE_LABELS[certState(c)].label, c.isRenewal ? "Yes" : "No", c.showInDirectory ? "Yes" : "No"]),
  ];
  return new NextResponse(rows.map((r) => r.map(csvCell).join(",")).join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="iclca-certifications-${day(new Date())}.csv"` },
  });
}
