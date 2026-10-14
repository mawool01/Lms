import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { parseBlocks } from "@/lib/blocks";
import { deleteLesson } from "@/lib/actions/courses";
import { blobClientConfig } from "@/lib/blob";
import { LessonEditor } from "@/components/lesson/lesson-editor";

export default async function EditLessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = await params;
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
  if (!lesson || lesson.module.courseId !== courseId) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/courses/${courseId}`} className="link text-sm">← Back to course</Link>
        <form action={deleteLesson.bind(null, lessonId)}>
          <button className="btn-ghost btn-sm text-red-600">Delete lesson</button>
        </form>
      </div>
      <LessonEditor
        lessonId={lessonId}
        courseId={courseId}
        initial={{ title: lesson.title, points: lesson.points, blocks: parseBlocks(lesson.blocks) }}
        uploadsEnabled={blobClientConfig()}
      />
    </div>
  );
}
