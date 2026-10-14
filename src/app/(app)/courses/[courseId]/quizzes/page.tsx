import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { createQuiz } from "@/lib/actions/assessments";
import { QuizSettingsForm } from "@/components/assess/quiz-settings-form";
import { LocalTime } from "@/components/forms";
import { Card, EmptyState, Pill } from "@/components/ui";

export default async function QuizzesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  const { canManage } = await requireCourseMember(user, courseId);
  const quizzes = await db.quiz.findMany({
    where: { courseId, ...(canManage ? {} : { published: true }) },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: {
      _count: { select: { questions: true } },
      attempts: { where: canManage ? {} : { userId: user.id }, select: { percent: true, passed: true, userId: true } },
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {quizzes.length === 0 && <EmptyState icon="📝" title="No quizzes yet" />}
        {quizzes.map((q) => {
          const best = q.attempts.length ? Math.max(...q.attempts.map((a) => a.percent)) : null;
          const avg = q.attempts.length ? Math.round(q.attempts.reduce((s, a) => s + a.percent, 0) / q.attempts.length) : null;
          const left = q.maxAttempts === 0 ? "Unlimited" : `${Math.max(0, q.maxAttempts - q.attempts.length)} left`;
          return (
            <Link key={q.id} href={`/courses/${courseId}/quizzes/${q.id}`} className="card flex items-center gap-4 p-4 transition hover:shadow-md">
              <span className="text-2xl">📝</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{q.title}</p>
                  {!q.published && <Pill tone="yellow">Draft</Pill>}
                </div>
                <p className="muted text-xs">
                  {q._count.questions} questions · pass at {q.passingScore}%{q.dueAt && <> · due <LocalTime date={q.dueAt} /></>}
                </p>
              </div>
              <div className="text-right text-sm">
                {canManage ? (
                  <>
                    <p className="font-semibold">{avg !== null ? `${avg}% avg` : "—"}</p>
                    <p className="muted text-xs">{new Set(q.attempts.map((a) => a.userId)).size} students attempted</p>
                  </>
                ) : best !== null ? (
                  <>
                    <Pill tone={q.attempts.some((a) => a.passed) ? "green" : "red"}>Best {best}%</Pill>
                    <p className="muted mt-1 text-xs">{left}</p>
                  </>
                ) : (
                  <Pill tone="brand">Not started</Pill>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      {canManage && (
        <Card title="New quiz">
          <QuizSettingsForm action={createQuiz.bind(null, courseId)} submitLabel="Create & add questions" />
        </Card>
      )}
    </div>
  );
}
