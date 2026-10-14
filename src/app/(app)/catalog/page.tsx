import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { enroll } from "@/lib/actions/courses";
import { CourseCard } from "@/components/course/course-card";
import { EmptyState, PageHeader } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Learning Center" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const user = await requireUser();
  const { q = "", category = "" } = await searchParams;
  const [courses, categories, mine] = await Promise.all([
    db.course.findMany({
      where: {
        published: true,
        ...(category ? { category } : {}),
        ...(q
          ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }
          : {}),
      },
      include: { teacher: { select: { name: true } }, _count: { select: { enrollments: true, modules: true } } },
      orderBy: { title: "asc" },
    }),
    db.course.findMany({ where: { published: true }, distinct: ["category"], select: { category: true } }),
    db.enrollment.findMany({ where: { userId: user.id }, select: { courseId: true } }),
  ]);
  const enrolled = new Set(mine.map((e) => e.courseId));

  return (
    <>
      <PageHeader title="Learning Center" subtitle="Discover courses offered at ICLCA and enroll in one click." />
      <form className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input name="q" defaultValue={q} placeholder="Search courses…" className="sm:max-w-sm" />
        <select name="category" defaultValue={category} className="sm:max-w-[200px]">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.category}>{c.category}</option>)}
        </select>
        <button className="btn-secondary">Search</button>
      </form>
      {courses.length === 0 ? (
        <EmptyState icon="🔎" title="No courses found">Try a different search or category.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              footer={
                <div className="flex items-center justify-between gap-2">
                  <span className="muted text-xs">{c._count.enrollments} enrolled</span>
                  {enrolled.has(c.id) ? (
                    <Link href={`/courses/${c.id}`} className="btn-secondary btn-sm">Open</Link>
                  ) : user.role === "STUDENT" ? (
                    <form action={enroll.bind(null, c.id)}>
                      <button className="btn-primary btn-sm">Enroll</button>
                    </form>
                  ) : (
                    <Link href={`/courses/${c.id}`} className="btn-secondary btn-sm">View</Link>
                  )}
                </div>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
