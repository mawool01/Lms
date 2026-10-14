import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { progressByCourse } from "@/lib/grades";
import { CourseCard } from "@/components/course/course-card";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "My courses" };

export default async function CoursesPage() {
  const user = await requireUser();
  const include = { teacher: { select: { name: true } }, _count: { select: { enrollments: true } } } as const;

  if (user.role === "STUDENT") {
    const courses = await db.course.findMany({ where: { enrollments: { some: { userId: user.id } } }, include, orderBy: { title: "asc" } });
    const progress = await progressByCourse(user.id, courses.map((c) => c.id));
    return (
      <>
        <PageHeader title="My courses" actions={<Link href="/catalog" className="btn-primary">Browse Learning Center</Link>} />
        {courses.length === 0 ? (
          <EmptyState icon="📘" title="You're not enrolled in any courses yet">
            Visit the <Link href="/catalog" className="link">Learning Center</Link> to find a course.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => <CourseCard key={c.id} course={c} progress={progress.get(c.id)} />)}
          </div>
        )}
      </>
    );
  }

  const courses = await db.course.findMany({
    where: user.role === "ADMIN" ? {} : { teacherId: user.id },
    include,
    orderBy: { updatedAt: "desc" },
  });
  return (
    <>
      <PageHeader
        title={user.role === "ADMIN" ? "All courses" : "Courses I teach"}
        actions={<Link href="/courses/new" className="btn-primary">+ New course</Link>}
      />
      {courses.length === 0 ? (
        <EmptyState icon="🧑‍🏫" title="No courses yet">Create your first course to start adding lessons, quizzes and assignments.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} footer={<p className="muted text-xs">{c._count.enrollments} students enrolled</p>} />
          ))}
        </div>
      )}
    </>
  );
}
