import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { submitQuiz, type AttemptAnswer } from "@/lib/actions/assessments";
import { LocalTime, SubmitButton } from "@/components/forms";
import { Avatar, Card, Pill, Stat } from "@/components/ui";

export default async function QuizPage({ params, searchParams }: { params: Promise<{ courseId: string; quizId: string }>; searchParams: Promise<{ take?: string }> }) {
  const { courseId, quizId } = await params;
  const { take } = await searchParams;
  const user = await requireUser();
  const { canManage, isEnrolled } = await requireCourseMember(user, courseId);
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
  });
  if (!quiz || quiz.courseId !== courseId || (!quiz.published && !canManage)) notFound();

  if (canManage) return <QuizResults quiz={quiz} courseId={courseId} />;

  const attempts = await db.quizAttempt.findMany({ where: { quizId, userId: user.id }, orderBy: { submittedAt: "desc" } });
  const remaining = quiz.maxAttempts === 0 ? Infinity : quiz.maxAttempts - attempts.length;
  const canTake = isEnrolled && remaining > 0;
  const best = attempts.length ? Math.max(...attempts.map((a) => a.percent)) : null;

  if (take && canTake) {
    return (
      <form action={submitQuiz.bind(null, quizId)} className="mx-auto max-w-3xl space-y-4">
        <h2 className="text-2xl font-bold">{quiz.title}</h2>
        {quiz.description && <p className="muted">{quiz.description}</p>}
        {quiz.questions.map((q, i) => (
          <fieldset key={q.id} className="card p-5">
            <legend className="sr-only">Question {i + 1}</legend>
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="font-medium whitespace-pre-wrap"><span className="muted mr-1">{i + 1}.</span> {q.prompt}</p>
              <Pill>{q.points} pt{q.points === 1 ? "" : "s"}</Pill>
            </div>
            {q.type === "MULTIPLE_CHOICE" && (
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 font-normal hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:border-slate-700 dark:hover:bg-slate-800 dark:has-[:checked]:bg-brand-950">
                    <input type="radio" name={`q_${q.id}`} value={oi} required /> {opt}
                  </label>
                ))}
              </div>
            )}
            {q.type === "TRUE_FALSE" && (
              <div className="grid grid-cols-2 gap-2">
                {["true", "false"].map((v) => (
                  <label key={v} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 font-normal capitalize has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:border-slate-700 dark:has-[:checked]:bg-brand-950">
                    <input type="radio" name={`q_${q.id}`} value={v} required /> {v}
                  </label>
                ))}
              </div>
            )}
            {q.type === "SHORT_ANSWER" && <input name={`q_${q.id}`} placeholder="Your answer" autoComplete="off" required />}
          </fieldset>
        ))}
        <div className="flex justify-end">
          <SubmitButton className="btn-primary px-6 py-3" pendingText="Submitting…">Submit answers</SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <h2 className="text-2xl font-bold">{quiz.title}</h2>
        {quiz.description && <p className="muted mt-1 whitespace-pre-wrap">{quiz.description}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Questions" value={quiz.questions.length} />
          <Stat label="Pass mark" value={`${quiz.passingScore}%`} />
          <Stat label="Attempts left" value={remaining === Infinity ? "∞" : Math.max(0, remaining)} />
          <Stat label="Best score" value={best !== null ? `${best}%` : "—"} />
        </div>
        {quiz.dueAt && <p className="muted mt-3 text-sm">Due <LocalTime date={quiz.dueAt} /></p>}
        {canTake ? (
          <Link href={`?take=1`} className="btn-primary mt-5">{attempts.length ? "Try again" : "Start quiz"}</Link>
        ) : (
          <p className="muted mt-5 text-sm">{isEnrolled ? "You've used all your attempts." : "Enroll in the course to take this quiz."}</p>
        )}
      </Card>
      {attempts.length > 0 && (
        <Card title="Your attempts">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {attempts.map((a, i) => (
              <li key={a.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm">Attempt {attempts.length - i} · <LocalTime date={a.submittedAt} /></span>
                <Link href={`/courses/${courseId}/quizzes/${quizId}/attempts/${a.id}`} className="flex items-center gap-2">
                  <Pill tone={a.passed ? "green" : "red"}>{a.percent}%</Pill>
                  <span className="link text-sm">Review</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

async function QuizResults({
  quiz,
  courseId,
}: {
  quiz: { id: string; title: string; published: boolean; passingScore: number; questions: { id: string; prompt: string }[] };
  courseId: string;
}) {
  const attempts = await db.quizAttempt.findMany({
    where: { quizId: quiz.id },
    orderBy: { submittedAt: "desc" },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  const avg = attempts.length ? Math.round(attempts.reduce((s, a) => s + a.percent, 0) / attempts.length) : null;
  const passRate = attempts.length ? Math.round((attempts.filter((a) => a.passed).length / attempts.length) * 100) : null;
  const questionStats = quiz.questions.map((q) => {
    const answered = attempts.map((a) => (a.answers as Record<string, AttemptAnswer>)[q.id]).filter(Boolean);
    const correct = answered.filter((x) => x.correct).length;
    return { ...q, rate: answered.length ? Math.round((correct / answered.length) * 100) : null };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">{quiz.title}</h2>
          {!quiz.published && <Pill tone="yellow">Draft</Pill>}
        </div>
        <Link href={`/courses/${courseId}/quizzes/${quiz.id}/edit`} className="btn-primary">✏️ Edit quiz & questions</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Questions" value={quiz.questions.length} />
        <Stat label="Attempts" value={attempts.length} />
        <Stat label="Average" value={avg !== null ? `${avg}%` : "—"} />
        <Stat label="Pass rate" value={passRate !== null ? `${passRate}%` : "—"} />
      </div>
      <Card title="Question difficulty" action={<span className="muted text-xs">% of attempts answering correctly</span>}>
        {questionStats.length === 0 ? (
          <p className="muted text-sm">No questions yet.</p>
        ) : (
          <ul className="space-y-3">
            {questionStats.map((q, i) => (
              <li key={q.id}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="truncate">{i + 1}. {q.prompt}</span>
                  <span className={q.rate !== null && q.rate < 50 ? "font-semibold text-red-600" : "font-semibold"}>{q.rate !== null ? `${q.rate}%` : "—"}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className={`h-full ${q.rate !== null && q.rate < 50 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${q.rate ?? 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="All attempts">
        {attempts.length === 0 ? (
          <p className="muted text-sm">No attempts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Student</th><th>Submitted</th><th>Score</th><th></th></tr></thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td><span className="flex items-center gap-2"><Avatar name={a.user.name} url={a.user.avatarUrl} size={24} />{a.user.name}</span></td>
                    <td className="muted"><LocalTime date={a.submittedAt} /></td>
                    <td><Pill tone={a.passed ? "green" : "red"}>{a.percent}% ({a.score}/{a.maxScore})</Pill></td>
                    <td><Link href={`/courses/${courseId}/quizzes/${quiz.id}/attempts/${a.id}`} className="link text-sm">Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
