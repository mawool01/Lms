import { z } from "zod";

/** Grading rubrics: criteria × performance levels. Safe to import from client components. */

export const rubricLevelSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().max(80),
  description: z.string().max(1000).default(""),
  points: z.number().min(0).max(1000),
});

export const rubricCriterionSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().max(200),
  description: z.string().max(1000).default(""),
  levels: z.array(rubricLevelSchema).min(1).max(10),
});

export const rubricCriteriaSchema = z.array(rubricCriterionSchema).max(30);

export type RubricLevel = z.infer<typeof rubricLevelSchema>;
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

/** What a rubric looks like once loaded (and what gets snapshotted into a grade). */
export type RubricData = { id: string; title: string; description: string; criteria: RubricCriterion[] };

export type RubricSelection = { levelId: string | null; points: number; comment: string };

/** A scored rubric, stored with the grade so later edits to the rubric don't change it. */
export type RubricScores = {
  rubric: RubricData;
  selections: Record<string, RubricSelection>;
  total: number;
  max: number;
};

export function parseCriteria(value: unknown): RubricCriterion[] {
  const parsed = rubricCriteriaSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function toRubricData(r: { id: string; title: string; description: string; criteria: unknown }): RubricData {
  return { id: r.id, title: r.title, description: r.description, criteria: parseCriteria(r.criteria) };
}

/** Highest points available for one criterion. */
export const criterionMax = (c: RubricCriterion) => Math.max(0, ...c.levels.map((l) => l.points));

/** Sum of each criterion's best level. */
export const rubricMax = (criteria: RubricCriterion[]) => criteria.reduce((s, c) => s + criterionMax(c), 0);

/** Converts a rubric total into the item's point scale, e.g. 14 of 16 rubric points → 88 of 100. */
export function scaleScore(total: number, max: number, outOf: number) {
  if (max <= 0) return 0;
  return Math.round((total / max) * outOf);
}

/** Levels sorted best-first for display. */
export const sortedLevels = (c: RubricCriterion) => [...c.levels].sort((a, b) => b.points - a.points);

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function blankCriterion(): RubricCriterion {
  return {
    id: newId(),
    title: "",
    description: "",
    levels: [
      { id: newId(), label: "Exemplary", description: "", points: 4 },
      { id: newId(), label: "Proficient", description: "", points: 3 },
      { id: newId(), label: "Developing", description: "", points: 2 },
      { id: newId(), label: "Beginning", description: "", points: 1 },
    ],
  };
}

/**
 * Validates a submitted rubric grade (JSON from the grader) against the rubric and recomputes the total server-side.
 * Returns null if nothing was selected.
 */
export function readRubricScores(raw: string, rubric: RubricData): RubricScores | { error: string } | null {
  if (!raw) return null;
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return { error: "The rubric scores couldn't be read. Please try again." };
  }
  const parsed = z.record(z.string(), z.object({ levelId: z.string().nullable(), comment: z.string().max(2000).default("") })).safeParse(input);
  if (!parsed.success) return { error: "The rubric scores couldn't be read. Please try again." };
  const selections: Record<string, RubricSelection> = {};
  let total = 0;
  let any = false;
  for (const c of rubric.criteria) {
    const sel = parsed.data[c.id];
    const level = sel?.levelId ? c.levels.find((l) => l.id === sel.levelId) : undefined;
    if (sel?.levelId && !level) return { error: "The rubric changed while you were grading. Reload the page and try again." };
    const comment = sel?.comment.trim() ?? "";
    if (level || comment) any = true;
    selections[c.id] = { levelId: level?.id ?? null, points: level?.points ?? 0, comment };
    total += level?.points ?? 0;
  }
  if (!any) return null;
  return { rubric, selections, total, max: rubricMax(rubric.criteria) };
}

export function isRubricScores(v: unknown): v is RubricScores {
  return !!v && typeof v === "object" && "rubric" in v && "selections" in v;
}
