import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { awardPoints, checkCourseCompletion } from "@/lib/gamification";
import { deriveStatus, formatSeconds, isComplete, parseDuration } from "./status";

const MAX_CMI_BYTES = 2 * 1024 * 1024;

/** Keys the LMS owns: learners' content can't overwrite them. */
const LMS_KEYS = new Set([
  "cmi.core.student_id",
  "cmi.core.student_name",
  "cmi.core.credit",
  "cmi.core.entry",
  "cmi.core.total_time",
  "cmi.core.lesson_mode",
  "cmi.launch_data",
  "cmi.student_data.mastery_score",
  "cmi.learner_id",
  "cmi.learner_name",
  "cmi.credit",
  "cmi.entry",
  "cmi.total_time",
  "cmi.mode",
]);

/** Builds the initial cmi data handed to the SCORM runtime for a learner. */
export function initialCmi(
  pkg: { version: "SCORM_12" | "SCORM_2004"; launchParams: string; masteryScore: number | null },
  user: { id: string; name: string },
  attempt: { cmi: unknown; totalSeconds: number; completionStatus: string } | null,
  mode: "normal" | "browse",
): Record<string, string> {
  const saved = { ...((attempt?.cmi as Record<string, string>) ?? {}) };
  const parts = user.name.trim().split(/\s+/);
  const learnerName = parts.length > 1 ? `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}` : user.name;
  const credit = mode === "normal" ? "credit" : "no-credit";

  if (pkg.version === "SCORM_12") {
    const resume = saved["cmi.core.exit"] === "suspend";
    delete saved["cmi.core.exit"];
    delete saved["cmi.core.session_time"];
    return {
      "cmi.core.lesson_status": "not attempted",
      ...saved,
      "cmi.core.student_id": user.id,
      "cmi.core.student_name": learnerName,
      "cmi.core.credit": credit,
      "cmi.core.entry": !attempt ? "ab-initio" : resume ? "resume" : "",
      "cmi.core.total_time": formatSeconds(attempt?.totalSeconds ?? 0, "SCORM_12"),
      "cmi.core.lesson_mode": mode,
      "cmi.launch_data": pkg.launchParams,
      ...(pkg.masteryScore !== null ? { "cmi.student_data.mastery_score": String(pkg.masteryScore) } : {}),
    };
  }
  const resume = saved["cmi.exit"] === "suspend";
  delete saved["cmi.exit"];
  delete saved["cmi.session_time"];
  return {
    "cmi.completion_status": "unknown",
    "cmi.success_status": "unknown",
    ...saved,
    "cmi.learner_id": user.id,
    "cmi.learner_name": learnerName,
    "cmi.credit": credit,
    "cmi.entry": !attempt ? "ab-initio" : resume ? "resume" : "",
    "cmi.total_time": formatSeconds(attempt?.totalSeconds ?? 0, "SCORM_2004"),
    "cmi.mode": mode,
    "cmi.launch_data": pkg.launchParams,
  };
}

/** Persists a commit from the SCORM runtime and updates grades, points and badges. */
export async function saveCmi(
  pkg: { id: string; courseId: string; version: "SCORM_12" | "SCORM_2004"; masteryScore: number | null; points: number; title: string },
  userId: string,
  incoming: Record<string, unknown>,
  finish: boolean,
) {
  const cmi: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (typeof k === "string" && k.startsWith("cmi.") && !LMS_KEYS.has(k) && !k.endsWith("._count") && !k.endsWith("._children")) {
      cmi[k] = String(v ?? "");
    }
  }
  if (JSON.stringify(cmi).length > MAX_CMI_BYTES) throw new Error("Tracking data too large");

  const existing = await db.scormAttempt.findUnique({ where: { packageId_userId: { packageId: pkg.id, userId } } });
  const derived = deriveStatus(pkg.version, cmi, pkg.masteryScore);
  const sessionSeconds = finish ? parseDuration(cmi[pkg.version === "SCORM_12" ? "cmi.core.session_time" : "cmi.session_time"]) : 0;
  const wasComplete = existing ? isComplete(existing) : false;
  const nowComplete = isComplete(derived);

  const data = {
    cmi: cmi as Prisma.InputJsonValue,
    ...derived,
    totalSeconds: (existing?.totalSeconds ?? 0) + Math.round(sessionSeconds),
    ...(finish ? { sessions: (existing?.sessions ?? 0) + 1 } : {}),
    ...(nowComplete && !existing?.completedAt ? { completedAt: new Date() } : {}),
  };
  const attempt = await db.scormAttempt.upsert({
    where: { packageId_userId: { packageId: pkg.id, userId } },
    update: data,
    create: { packageId: pkg.id, userId, ...data, sessions: finish ? 1 : 0 },
  });

  if (nowComplete && !wasComplete) {
    if (pkg.points > 0) await awardPoints(userId, pkg.points, `Completed “${pkg.title}”`, `scorm-complete:${pkg.id}`, pkg.courseId);
    await checkCourseCompletion(userId, pkg.courseId);
  }
  return attempt;
}
