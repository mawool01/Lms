import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { deleteCourse, updateCourse } from "@/lib/actions/courses";
import { CourseForm } from "@/components/course/course-form";
import { WaEventsCard } from "@/components/course/wa-events-card";
import { Card } from "@/components/ui";

export default async function CourseSettingsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  const { course } = await requireCourseManager(user, courseId);
  const teachers = user.role === "ADMIN" ? await db.user.findMany({ where: { role: { in: ["TEACHER", "ADMIN"] }, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : undefined;

  return (
    <div className="max-w-3xl space-y-6">
      <Card title="Course details">
        <CourseForm action={updateCourse.bind(null, courseId)} values={course} teachers={teachers} submitLabel="Save changes" />
      </Card>
      <WaEventsCard courseId={courseId} />
      <Card title="Danger zone" className="border-red-200 dark:border-red-900">
        <p className="muted mb-3 text-sm">Deleting a course permanently removes its lessons, quizzes, assignments, grades and discussions.</p>
        <form action={deleteCourse.bind(null, courseId)}>
          <button className="btn-danger">Delete course</button>
        </form>
      </Card>
    </div>
  );
}
