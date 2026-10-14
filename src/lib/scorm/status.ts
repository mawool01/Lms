/** Shared (client + server) helpers for interpreting SCORM tracking data. */

export type ScormDerived = {
  completionStatus: string;
  successStatus: string;
  scoreRaw: number | null;
  scoreMin: number | null;
  scoreMax: number | null;
  scoreScaled: number | null;
  percent: number | null;
};

const num = (v: string | undefined) => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (n: number) => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;

/** Reads completion, success and score from a flat cmi map. */
export function deriveStatus(version: "SCORM_12" | "SCORM_2004", cmi: Record<string, string>, masteryScore: number | null): ScormDerived {
  let completionStatus = "not attempted";
  let successStatus = "unknown";
  let scoreRaw: number | null, scoreMin: number | null, scoreMax: number | null, scoreScaled: number | null = null;

  if (version === "SCORM_12") {
    const status = (cmi["cmi.core.lesson_status"] ?? "not attempted").toLowerCase();
    scoreRaw = num(cmi["cmi.core.score.raw"]);
    scoreMin = num(cmi["cmi.core.score.min"]);
    scoreMax = num(cmi["cmi.core.score.max"]);
    if (status === "passed" || status === "failed") {
      completionStatus = "completed";
      successStatus = status;
    } else {
      completionStatus = status;
    }
    // The LMS decides pass/fail when the package defines a mastery score.
    if (masteryScore !== null && scoreRaw !== null && (status === "completed" || status === "passed" || status === "failed")) {
      successStatus = scoreRaw >= masteryScore ? "passed" : "failed";
    }
  } else {
    completionStatus = (cmi["cmi.completion_status"] ?? "unknown").toLowerCase();
    successStatus = (cmi["cmi.success_status"] ?? "unknown").toLowerCase();
    scoreRaw = num(cmi["cmi.score.raw"]);
    scoreMin = num(cmi["cmi.score.min"]);
    scoreMax = num(cmi["cmi.score.max"]);
    scoreScaled = num(cmi["cmi.score.scaled"]);
    if (completionStatus === "unknown" && (successStatus === "passed" || successStatus === "failed")) completionStatus = "completed";
    if (completionStatus === "unknown" && Object.keys(cmi).length > 0) completionStatus = "incomplete";
  }

  let percent: number | null = null;
  if (scoreScaled !== null) percent = clamp(scoreScaled * 100);
  else if (scoreRaw !== null && scoreMax !== null && scoreMax > (scoreMin ?? 0)) percent = clamp(((scoreRaw - (scoreMin ?? 0)) / (scoreMax - (scoreMin ?? 0))) * 100);
  else if (scoreRaw !== null && scoreRaw >= 0 && scoreRaw <= 100) percent = clamp(scoreRaw);

  return { completionStatus, successStatus, scoreRaw, scoreMin, scoreMax, scoreScaled, percent };
}

export const isComplete = (a: { completionStatus: string; successStatus: string }) =>
  a.completionStatus === "completed" || a.successStatus === "passed" || a.successStatus === "failed";

/** The grade (0–100) that counts toward the course, or null if there's nothing to grade yet. */
export function scormGrade(
  pkg: { gradeMethod: "SCORE" | "COMPLETION" },
  attempt: { completionStatus: string; successStatus: string; percent: number | null; overridePercent: number | null } | null | undefined,
): number | null {
  if (!attempt) return null;
  if (attempt.overridePercent !== null) return attempt.overridePercent;
  if (!isComplete(attempt)) return null;
  if (pkg.gradeMethod === "COMPLETION") return 100;
  if (attempt.percent !== null) return attempt.percent;
  // No score reported: fall back to the pass/fail or completion result.
  return attempt.successStatus === "failed" ? 0 : 100;
}

export function statusLabel(attempt: { completionStatus: string; successStatus: string } | null | undefined) {
  if (!attempt || attempt.completionStatus === "not attempted") return { label: "Not started", tone: "gray" as const };
  if (attempt.successStatus === "passed") return { label: "Passed", tone: "green" as const };
  if (attempt.successStatus === "failed") return { label: "Failed", tone: "red" as const };
  if (attempt.completionStatus === "completed") return { label: "Completed", tone: "green" as const };
  return { label: "In progress", tone: "brand" as const };
}

/** Parses SCORM 1.2 ("HHHH:MM:SS.SS") or SCORM 2004 (ISO 8601 "PT1H2M3.5S") durations into seconds. */
export function parseDuration(value: string | undefined): number {
  if (!value) return 0;
  const v = value.trim();
  const hms = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(v);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const iso = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(v);
  if (iso) {
    const [, y, mo, d, h, mi, s] = iso.map((x) => (x ? Number(x) : 0));
    return y * 31536000 + mo * 2592000 + d * 86400 + h * 3600 + mi * 60 + s;
  }
  return 0;
}

export function formatSeconds(total: number, version: "SCORM_12" | "SCORM_2004") {
  const t = Math.max(0, Math.round(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (version === "SCORM_2004") return `PT${h}H${m}M${s}S`;
  return `${String(h).padStart(4, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function humanDuration(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
