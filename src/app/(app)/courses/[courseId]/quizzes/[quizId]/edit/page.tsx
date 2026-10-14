import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseManager } from "@/lib/permissions";
import { addQuestion, deleteQuestion, deleteQuiz, updateQuestion, updateQuiz } from "@/lib/actions/assessments";
import { QuestionForm } from "@/components/assess/question-form";
import { QuizSettingsForm } from "@/components/assess/quiz-settings-form";
import { Card, Pill } from "@/components/ui";
import { rubricOptions } from "@/lib/rubric-access";

const TYPE_LABELS = { MULTIPLE_CHOICE: "Multiple choice", TRUE_FALSE: "True / False", SHORT_ANSWER: "Short answer", ESSAY: "Essay" };

export default async function EditQuizPage({ params }: { params: Promise<{ courseId: string; quizId: string }> }) {
  const { courseId, quizId } = await params;
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  const quiz = await db.quiz.findUnique({ where: { id: quizId }, include: { questions: { orderBy: [{ position: "asc" }, { id: "asc" }] } } });
  if (!quiz || quiz.courseId !== courseId) notFound();
  const rubrics = await rubricOptions(user);
  const withAttached = (id: string | null) => (id && !rubrics.some((r) => r.id === id) ? [...rubrics, { id, label: "Current rubric" }] : rubrics);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/courses/${courseId}/quizzes/${quizId}`} className="link text-sm">← Quiz results</Link>
        <form action={deleteQuiz.bind(null, quizId)}><button className="btn-ghost btn-sm text-red-600">Delete quiz</button></form>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <h2 className="text-lg font-semibold">Questions ({quiz.questions.length})</h2>
          {quiz.questions.map((q, i) => (
            <details key={q.id} className="card group p-4">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <span className="font-medium">{i + 1}. {q.prompt}</span>
                <span className="flex shrink-0 gap-1"><Pill tone={q.type === "ESSAY" ? "purple" : "gray"}>{TYPE_LABELS[q.type]}{q.rubricId && " · rubric"}</Pill><Pill tone="brand">{q.points} pt</Pill></span>
              </summary>
              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <QuestionForm action={updateQuestion.bind(null, q.id)} initial={q} submitLabel="Update question" rubrics={withAttached(q.rubricId)} />
                <form action={deleteQuestion.bind(null, q.id)} className="mt-2">
                  <button className="text-xs text-red-600 hover:underline">Delete question</button>
                </form>
              </div>
            </details>
          ))}
          <Card title="Add a question">
            <QuestionForm action={addQuestion.bind(null, quizId)} submitLabel="Add question" rubrics={rubrics} />
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card title="Quiz settings">
            <QuizSettingsForm action={updateQuiz.bind(null, quizId)} values={quiz} submitLabel="Save settings" />
          </Card>
        </div>
      </div>
    </div>
  );
}
