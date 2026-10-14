import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCourseAccess } from "@/lib/permissions";
import { enroll } from "@/lib/actions/courses";
import { CourseTabs } from "@/components/course/course-tabs";
import { CourseCover } from "@/components/course/course-card";
import { Pill } from "@/components/ui";

export default async function CourseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  const { course, canManage, isEnrolled } = await getCourseAccess(user, courseId);
  const isMember = canManage || isEnrolled;

  return (
    <div>
      <div className="card mb-6 overflow-hidden">
        <CourseCover id={course.id} code={course.code} coverUrl={course.coverUrl} className="h-24 sm:h-32" />
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap gap-1.5">
              <Pill>{course.code}</Pill>
              <Pill>{course.category}</Pill>
              {!course.published && <Pill tone="yellow">Draft</Pill>}
              {canManage && <Pill tone="brand">Instructor view</Pill>}
            </div>
            <h1 className="text-2xl font-bold">{course.title}</h1>
            <p className="muted text-sm">
              Taught by <Link href={`/users/${course.teacher.id}`} className="link">{course.teacher.name}</Link>
            </p>
          </div>
          {!isMember && user.role === "STUDENT" && (
            <form action={enroll.bind(null, course.id)}>
              <button className="btn-primary">Enroll in this course</button>
            </form>
          )}
        </div>
      </div>
      {isMember && <CourseTabs courseId={course.id} canManage={canManage} />}
      {children}
    </div>
  );
}
