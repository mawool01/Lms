import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import type { AttemptAnswer } from "@/lib/actions/assessments";
import { Card, Pill } from "@/components/ui";

export default async function AttemptPage({ params }: { params: Promise<{ courseId: string; quizId: string; attemptId: string }> }) {
  const { courseId, quizId, attemptId } = await params;
  const user = await requireUser();
  const { canManage } = await requireCourseMember(user, courseId);
  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { user: { select: { name: true } }, quiz: { include: { questions: { orderBy: [{ position: "asc" }, { id: "asc" }] } } } },
  });
  if (!attempt || attempt.quizId !== quizId || attempt.quiz.courseId !== courseId) notFound();
  if (!canManage && attempt.userId !== user.id) notFound();

  const quiz = attempt.quiz;
  const answers = attempt.answers as Record<string, AttemptAnswer>;
  const used = await db.quizAttempt.count({ where: { quizId, userId: attempt.userId } });
  const passedEver = await db.quizAttempt.count({ where: { quizId, userId: attempt.userId, passed: true } });
  // Reveal correct answers to students once they've passed or used all attempts.
  const reveal = canManage || passedEver > 0 || (quiz.maxAttempts > 0 && used >= quiz.maxAttempts);

  const display = (q: (typeof quiz.questions)[number], value: string) => {
    if (q.type === "MULTIPLE_CHOICE") return q.options[Number(value)] ?? "—";
    if (q.type === "TRUE_FALSE") return value ? value[0].toUpperCase() + value.slice(1) : "—";
    return value || "—";
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/courses/${courseId}/quizzes/${quizId}`} className="link text-sm">← Back to quiz</Link>
      <Card>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="text-5xl">{attempt.passed ? (attempt.percent === 100 ? "🏆" : "🎉") : "📚"}</span>
          <h2 className="text-2xl font-bold">{attempt.percent}%</h2>
          <p className="muted">
            {attempt.user.name} scored {attempt.score} of {attempt.maxScore} points on {quiz.title}
          </p>
          <Pill tone={attempt.passed ? "green" : "red"}>{attempt.passed ? "Passed" : `Not passed — ${quiz.passingScore}% needed`}</Pill>
        </div>
      </Card>
      {quiz.questions.map((q, i) => {
        const a = answers[q.id];
        return (
          <div key={q.id} className={`card border-l-4 p-5 ${a?.correct ? "border-l-emerald-500" : "border-l-red-500"}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium whitespace-pre-wrap">{i + 1}. {q.prompt}</p>
              <span className="text-sm font-semibold">{a?.earned ?? 0}/{q.points}</span>
            </div>
            <p className="mt-2 text-sm">
              Your answer: <span className={a?.correct ? "font-medium text-emerald-600" : "font-medium text-red-600"}>{display(q, a?.value ?? "")}</span>
            </p>
            {reveal && !a?.correct && (
              <p className="mt-1 text-sm">
                Correct answer: <span className="font-medium">{q.type === "SHORT_ANSWER" ? q.answer.split("|").join(" / ") : display(q, q.answer)}</span>
              </p>
            )}
          </div>
        );
      })}
      {!reveal && <p className="muted text-center text-sm">Correct answers are shown once you pass or use all attempts.</p>}
    </div>
  );
}
