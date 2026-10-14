import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { gradeEssayAnswers, type AttemptAnswer } from "@/lib/actions/assessments";
import { toRubricData } from "@/lib/rubrics";
import { ActionForm, LocalTime, SubmitButton } from "@/components/forms";
import { RubricGrader } from "@/components/rubrics/rubric-grader";
import { RubricView } from "@/components/rubrics/rubric-view";
import { Card, Pill } from "@/components/ui";

export default async function AttemptPage({ params }: { params: Promise<{ courseId: string; quizId: string; attemptId: string }> }) {
  const { courseId, quizId, attemptId } = await params;
  const user = await requireUser();
  const { canManage } = await requireCourseMember(user, courseId);
  const attempt = await db.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { user: { select: { name: true } }, quiz: { include: { questions: { orderBy: [{ position: "asc" }, { id: "asc" }], include: { rubric: true } } } } },
  });
  if (!attempt || attempt.quizId !== quizId || attempt.quiz.courseId !== courseId) notFound();
  if (!canManage && attempt.userId !== user.id) notFound();

  const quiz = attempt.quiz;
  const answers = attempt.answers as Record<string, AttemptAnswer>;
  const used = await db.quizAttempt.count({ where: { quizId, userId: attempt.userId } });
  const passedEver = await db.quizAttempt.count({ where: { quizId, userId: attempt.userId, passed: true } });
  // Reveal correct answers to students once they've passed or used all attempts.
  const reveal = canManage || passedEver > 0 || (quiz.maxAttempts > 0 && used >= quiz.maxAttempts);
  const essays = quiz.questions.filter((q) => q.type === "ESSAY" && answers[q.id]);

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
          {attempt.needsGrading ? (
            <>
              <span className="text-5xl">⏳</span>
              <h2 className="text-2xl font-bold">Awaiting grading</h2>
              <p className="muted">
                {canManage ? `${attempt.user.name}'s` : "Your"} essay {essays.length === 1 ? "answer needs" : "answers need"} to be scored by a teacher.
                {essays.length < quiz.questions.length && ` Auto-graded so far: ${attempt.score} points.`}
              </p>
              <Pill tone="yellow">Pending</Pill>
            </>
          ) : (
            <>
              <span className="text-5xl">{attempt.passed ? (attempt.percent === 100 ? "🏆" : "🎉") : "📚"}</span>
              <h2 className="text-2xl font-bold">{attempt.percent}%</h2>
              <p className="muted">
                {attempt.user.name} scored {attempt.score} of {attempt.maxScore} points on {quiz.title}
              </p>
              <Pill tone={attempt.passed ? "green" : "red"}>{attempt.passed ? "Passed" : `Not passed — ${quiz.passingScore}% needed`}</Pill>
              {attempt.gradedAt && <p className="muted text-xs">Essays graded <LocalTime date={attempt.gradedAt} /></p>}
            </>
          )}
        </div>
      </Card>
      {quiz.questions.map((q, i) => {
        const a = answers[q.id];
        if (q.type === "ESSAY") {
          const pending = !a || a.graded === false;
          return (
            <div key={q.id} className={`card border-l-4 p-5 ${pending ? "border-l-amber-400" : "border-l-brand-500"}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium whitespace-pre-wrap">{i + 1}. {q.prompt}</p>
                <span className="shrink-0 text-sm font-semibold">{pending ? <Pill tone="yellow">Awaiting grading</Pill> : `${a.earned}/${q.points}`}</span>
              </div>
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:bg-slate-800/50">{a?.value || <span className="muted italic">No response.</span>}</div>
              {!pending && a.feedback && (
                <div className="mt-3 rounded-lg bg-brand-50 p-3 text-sm whitespace-pre-wrap dark:bg-brand-950/50"><span className="font-semibold">Feedback: </span>{a.feedback}</div>
              )}
              {!pending && a.rubricScores && (
                <div className="mt-3"><RubricView rubric={a.rubricScores.rubric} selections={a.rubricScores.selections} compact /></div>
              )}
              {pending && !canManage && q.rubric && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer">How this will be graded</summary>
                  <div className="mt-2"><RubricView rubric={toRubricData(q.rubric)} compact /></div>
                </details>
              )}
            </div>
          );
        }
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
      {!reveal && essays.length < quiz.questions.length && <p className="muted text-center text-sm">Correct answers are shown once you pass or use all attempts.</p>}
      {canManage && essays.length > 0 && (
        <Card title={attempt.needsGrading ? "Grade essay answers" : "Essay grades"}>
          <ActionForm action={gradeEssayAnswers.bind(null, attempt.id)} className="space-y-6">
            {essays.map((q) => {
              const a = answers[q.id];
              const rubric = q.rubric ? toRubricData(q.rubric) : null;
              const initial = a.graded ? a.earned : null;
              return (
                <section key={q.id} className="space-y-2 border-b border-slate-100 pb-5 last:border-0 dark:border-slate-800" aria-label={`Grade: ${q.prompt}`}>
                  <p className="font-medium">{quiz.questions.indexOf(q) + 1}. {q.prompt} <span className="muted text-xs">({q.points} pts)</span></p>
                  {rubric ? (
                    <RubricGrader
                      rubric={rubric}
                      outOf={q.points}
                      scoreName={`points_${q.id}`}
                      rubricField={`rubric_${q.id}`}
                      scoreLabel="Score"
                      initialScore={initial}
                      initialSelections={a.rubricScores?.rubric.id === rubric.id ? a.rubricScores.selections : null}
                    />
                  ) : (
                    <label className="flex items-center gap-2 text-sm font-normal">
                      Score
                      <input name={`points_${q.id}`} type="number" min={0} max={q.points} step="0.5" defaultValue={initial ?? ""} className="w-24" aria-label="Score" required />
                      <span className="muted">/ {q.points}</span>
                    </label>
                  )}
                  <textarea name={`feedback_${q.id}`} rows={2} defaultValue={a.feedback ?? ""} placeholder="Feedback for the student" aria-label="Essay feedback" />
                </section>
              );
            })}
            <SubmitButton>{attempt.needsGrading ? "Save grades" : "Update grades"}</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
