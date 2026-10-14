import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { parseBlocks } from "@/lib/blocks";
import { toggleLessonComplete } from "@/lib/actions/courses";
import { BlockRenderer } from "@/components/lesson/block-renderer";
import { SubmitButton } from "@/components/forms";

export default async function LessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = await params;
  const user = await requireUser();
  const { canManage, isEnrolled } = await requireCourseMember(user, courseId);
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
  if (!lesson || lesson.module.courseId !== courseId) notFound();

  const [ordered, completion] = await Promise.all([
    db.lesson.findMany({
      where: { module: { courseId } },
      orderBy: [{ module: { position: "asc" } }, { moduleId: "asc" }, { position: "asc" }, { id: "asc" }],
      select: { id: true, title: true },
    }),
    db.lessonCompletion.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId } } }),
  ]);
  const index = ordered.findIndex((l) => l.id === lessonId);
  const prev = ordered[index - 1];
  const next = ordered[index + 1];
  const blocks = parseBlocks(lesson.blocks);

  return (
    <article className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="muted text-sm">{lesson.module.title} · Lesson {index + 1} of {ordered.length}</p>
          <h2 className="text-2xl font-bold">{lesson.title}</h2>
        </div>
        {canManage && <Link href={`/courses/${courseId}/lessons/${lessonId}/edit`} className="btn-secondary">✏️ Edit lesson</Link>}
      </div>

      <div className="card p-5 sm:p-8">
        {blocks.length === 0 ? <p className="muted italic">This lesson has no content yet.</p> : blocks.map((b) => <BlockRenderer key={b.id} block={b} />)}
      </div>

      {isEnrolled && (
        <form action={toggleLessonComplete.bind(null, lessonId)} className="mt-6 flex justify-center">
          {completion ? (
            <SubmitButton className="btn-secondary">✔ Completed — mark as not done</SubmitButton>
          ) : (
            <SubmitButton className="btn-primary px-6 py-3 text-base" pendingText="Saving…">Mark complete · +{lesson.points} pts</SubmitButton>
          )}
        </form>
      )}

      <nav className="mt-6 flex justify-between gap-2">
        {prev ? <Link href={`/courses/${courseId}/lessons/${prev.id}`} className="btn-ghost max-w-[48%] truncate">← {prev.title}</Link> : <span />}
        {next ? <Link href={`/courses/${courseId}/lessons/${next.id}`} className="btn-ghost max-w-[48%] truncate">{next.title} →</Link> : <span />}
      </nav>
    </article>
  );
}
