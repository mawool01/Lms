import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseReports } from "@/lib/grades";
import { letterGrade } from "@/lib/utils";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralize spreadsheet formula injection and quote everything.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!user || !course || (user.role !== "ADMIN" && course.teacherId !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const enrollments = await db.enrollment.findMany({ where: { courseId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } } });
  const reports = await courseReports(courseId, enrollments.map((e) => e.userId));
  const columns = reports.values().next().value?.items ?? [];
  const rows = [
    ["Student", "Email", "Progress %", ...columns.map((c) => `${c.title} (${c.kind}, weight ${c.weight})`), "Grade %", "Letter"],
    ...enrollments.map(({ user: s }) => {
      const r = reports.get(s.id)!;
      return [s.name, s.email, r.progress, ...r.items.map((i) => i.percent ?? ""), r.grade ?? "", letterGrade(r.grade)];
    }),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${course.code}-gradebook.csv"`,
    },
  });
}
