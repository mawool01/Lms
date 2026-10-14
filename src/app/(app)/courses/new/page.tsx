import { requireRole } from "@/lib/auth";
import { createCourse } from "@/lib/actions/courses";
import { CourseForm } from "@/components/course/course-form";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "New course" };

export default async function NewCoursePage() {
  await requireRole("TEACHER", "ADMIN");
  return (
    <>
      <PageHeader title="Create a course" subtitle="You can add modules, lessons, quizzes and assignments next. Courses start as drafts." />
      <Card>
        <CourseForm action={createCourse} submitLabel="Create course" />
      </Card>
    </>
  );
}
