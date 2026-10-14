import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { deleteScormPackage, markScormComplete, overrideScormGrade, resetScormAttempt, updateScormPackage } from "@/lib/actions/scorm";
import { humanDuration, scormGrade, statusLabel } from "@/lib/scorm/status";
import { ActionForm, LocalTime, SubmitButton } from "@/components/forms";
import { Markdown } from "@/components/markdown";
import { Avatar, Card, Pill, Stat } from "@/components/ui";

export default async function ScormPackagePage({ params }: { params: Promise<{ courseId: string; packageId: string }> }) {
  const { courseId, packageId } = await params;
  const user = await requireUser();
  const { canManage, isEnrolled } = await requireCourseMember(user, courseId);
  const pkg = await db.scormPackage.findUnique({ where: { id: packageId }, include: { module: { select: { title: true } } } });
  if (!pkg || pkg.courseId !== courseId || (!pkg.published && !canManage)) notFound();
  const versionLabel = pkg.version === "SCORM_12" ? "SCORM 1.2" : "SCORM 2004";

  const header = (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap gap-1.5">
            <Pill tone="purple">📦 {versionLabel}</Pill>
            {pkg.module && <Pill>{pkg.module.title}</Pill>}
            {!pkg.published && <Pill tone="yellow">Draft</Pill>}
          </div>
          <h2 className="text-2xl font-bold">{pkg.title}</h2>
          <p className="muted text-sm">
            {pkg.gradeMethod === "SCORE" ? "Graded by the package's score" : "Full credit on completion"} · weight {pkg.weight} · {pkg.points} pts on completion
          </p>
        </div>
        <Link href={`/courses/${courseId}/scorm/${packageId}/play`} className="btn-primary">
          {canManage ? "👁 Preview" : "▶ Launch"}
        </Link>
      </div>
      {pkg.description && <div className="mt-3"><Markdown>{pkg.description}</Markdown></div>}
    </Card>
  );

  if (!canManage) {
    const attempt = isEnrolled ? await db.scormAttempt.findUnique({ where: { packageId_userId: { packageId, userId: user.id } } }) : null;
    const status = statusLabel(attempt);
    const grade = scormGrade(pkg, attempt);
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={`/courses/${courseId}`} className="link text-sm">← Course content</Link>
        {header}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Status" value={<Pill tone={status.tone}>{status.label}</Pill>} />
          <Stat label="Grade" value={grade !== null ? `${grade}%` : "—"} />
          <Stat label="Time spent" value={attempt ? humanDuration(attempt.totalSeconds) : "—"} />
          <Stat label="Sessions" value={attempt?.sessions ?? 0} />
        </div>
        {attempt?.feedback && (
          <Card title="Feedback from your teacher">
            <p className="whitespace-pre-wrap">{attempt.feedback}</p>
          </Card>
        )}
        {attempt && attempt.completionStatus !== "not attempted" && !attempt.completedAt && (
          <p className="muted text-center text-sm">Launch again to resume where you left off.</p>
        )}
      </div>
    );
  }

  const [students, attempts, modules] = await Promise.all([
    db.enrollment.findMany({ where: { courseId }, include: { user: { select: { id: true, name: true, avatarUrl: true } } }, orderBy: { user: { name: "asc" } } }),
    db.scormAttempt.findMany({ where: { packageId } }),
    db.module.findMany({ where: { courseId }, orderBy: { position: "asc" }, select: { id: true, title: true } }),
  ]);
  const byUser = new Map(attempts.map((a) => [a.userId, a]));
  const grades = attempts.map((a) => scormGrade(pkg, a)).filter((g): g is number => g !== null);
  const completed = attempts.filter((a) => a.completedAt).length;

  return (
    <div className="space-y-6">
      <Link href={`/courses/${courseId}`} className="link text-sm">← Course content</Link>
      {header}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Started" value={`${attempts.length}/${students.length}`} />
        <Stat label="Completed" value={completed} />
        <Stat label="Average grade" value={grades.length ? `${Math.round(grades.reduce((s, g) => s + g, 0) / grades.length)}%` : "—"} />
        <Stat label="Avg. time" value={attempts.length ? humanDuration(attempts.reduce((s, a) => s + a.totalSeconds, 0) / attempts.length) : "—"} />
      </div>

      <Card title="Learner results">
        {students.length === 0 ? (
          <p className="muted text-sm">No students enrolled.</p>
        ) : (
          <div className="space-y-2">
            {students.map(({ user: s }) => {
              const a = byUser.get(s.id);
              const status = statusLabel(a);
              const grade = scormGrade(pkg, a);
              return (
                <details key={s.id} className="rounded-xl border border-slate-200 dark:border-slate-800">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-3">
                    <Avatar name={s.name} url={s.avatarUrl} size={28} />
                    <span className="min-w-0 flex-1 font-medium">{s.name}</span>
                    <Pill tone={status.tone}>{status.label}</Pill>
                    {a?.percent != null && <span className="muted text-xs">score {a.percent}%</span>}
                    <span className="w-24 text-right font-semibold">
                      {grade !== null ? `${grade}%` : "—"}
                      {a?.overridePercent != null && <span className="muted ml-1 text-xs font-normal">(override)</span>}
                    </span>
                  </summary>
                  <div className="space-y-3 border-t border-slate-100 p-4 text-sm dark:border-slate-800">
                    {a ? (
                      <>
                        <p className="muted text-xs">
                          Started <LocalTime date={a.startedAt} /> · last activity <LocalTime date={a.updatedAt} /> · {humanDuration(a.totalSeconds)} over {a.sessions} session(s)
                          {a.scoreRaw !== null && <> · raw score {a.scoreRaw}{a.scoreMax !== null && `/${a.scoreMax}`}</>}
                        </p>
                        <ActionForm action={overrideScormGrade.bind(null, a.id)} className="grid gap-2 sm:grid-cols-[140px_1fr_auto] sm:items-start">
                          <input name="grade" type="number" min={0} max={100} step="0.1" defaultValue={a.overridePercent ?? ""} placeholder="Override %" aria-label="Override grade" />
                          <textarea name="feedback" rows={2} defaultValue={a.feedback ?? ""} placeholder="Feedback for the student" aria-label="Feedback" />
                          <SubmitButton className="btn-primary">Save grade</SubmitButton>
                        </ActionForm>
                        <p className="muted text-xs">Leave the override empty to use the score reported by the package.</p>
                        <form action={resetScormAttempt.bind(null, a.id)}>
                          <button className="text-xs text-red-600 hover:underline">Reset attempt (learner starts over)</button>
                        </form>
                      </>
                    ) : (
                      <form action={markScormComplete.bind(null, packageId, s.id)} className="flex items-center gap-3">
                        <span className="muted">Not started.</span>
                        <button className="btn-secondary btn-sm">Mark complete manually</button>
                      </form>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Settings">
        <ActionForm action={updateScormPackage.bind(null, packageId)} className="space-y-4">
          <div className="field">
            <label htmlFor="s-title">Title</label>
            <input id="s-title" name="title" defaultValue={pkg.title} required />
          </div>
          <div className="field">
            <label htmlFor="s-desc">Description <span className="muted font-normal">(Markdown)</span></label>
            <textarea id="s-desc" name="description" rows={3} defaultValue={pkg.description} />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="field sm:col-span-2">
              <label htmlFor="s-module">Module</label>
              <select id="s-module" name="moduleId" defaultValue={pkg.moduleId ?? ""}>
                <option value="">— No module —</option>
                {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="s-weight">Grade weight</label>
              <input id="s-weight" name="weight" type="number" min={0} max={1000} defaultValue={pkg.weight} />
            </div>
            <div className="field">
              <label htmlFor="s-points">Points</label>
              <input id="s-points" name="points" type="number" min={0} max={1000} defaultValue={pkg.points} />
            </div>
          </div>
          <div className="field sm:max-w-sm">
            <label htmlFor="s-grade">Grading</label>
            <select id="s-grade" name="gradeMethod" defaultValue={pkg.gradeMethod}>
              <option value="SCORE">Use the package&apos;s score (falls back to pass/complete)</option>
              <option value="COMPLETION">Full credit on completion</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="published" defaultChecked={pkg.published} /> Published (visible to students)
          </label>
          <SubmitButton>Save settings</SubmitButton>
        </ActionForm>
        <div className="muted mt-6 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
          {versionLabel} · launches <code>{pkg.launchPath}</code> · {pkg.fileCount} files · {(pkg.sizeBytes / 1024 / 1024).toFixed(1)} MB
          {pkg.masteryScore !== null && <> · mastery score {pkg.masteryScore}</>}
        </div>
        <form action={deleteScormPackage.bind(null, packageId)} className="mt-4">
          <button className="btn-ghost btn-sm text-red-600">Delete package and all learner results</button>
        </form>
      </Card>
    </div>
  );
}
