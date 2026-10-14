import type { Block } from "./blocks";

/** Ungraded practice questions embedded in lessons. Safe to import from client components. */

export type CheckBlock = Extract<Block, { type: "check" }>;
export type CheckQuestion = CheckBlock["questions"][number];
/** What learners' browsers receive: no answers or explanations until they answer. */
export type PublicCheckQuestion = Omit<CheckQuestion, "answer" | "explanation">;
export type PublicCheckBlock = Omit<CheckBlock, "questions"> & { questions: PublicCheckQuestion[] };

export type CheckResult = { correct: boolean; explanation: string };
/** Per-question class results shown to teachers. */
export type CheckStats = Record<string, { learners: number; firstTry: number; correctNow: number }>;
/** A learner's latest answer per question, so the block remembers their progress. */
export type CheckProgress = Record<string, { value: string; correct: boolean; explanation: string }>;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function isCorrect(q: CheckQuestion, value: string) {
  if (!value.trim()) return false;
  if (q.kind === "short") return q.answer.split("|").some((a) => a.trim() && normalize(a) === normalize(value));
  return value === q.answer;
}

export function toPublicCheck(block: CheckBlock): PublicCheckBlock {
  return { ...block, questions: block.questions.map((q) => ({ id: q.id, kind: q.kind, prompt: q.prompt, options: q.options })) };
}

/** Problem with a knowledge check's setup, or null. */
export function checkProblem(block: CheckBlock): string | null {
  if (!block.questions.length) return "Add at least one question to each knowledge check.";
  for (const [i, q] of block.questions.entries()) {
    const n = `Knowledge check question ${i + 1}`;
    if (!q.prompt.trim()) return `${n} needs question text.`;
    if (q.kind === "mc") {
      if (q.options.filter((o) => o.trim()).length < 2) return `${n} needs at least two choices.`;
      if (!q.options[Number(q.answer)]?.trim()) return `${n}: select which choice is correct.`;
    }
    if (q.kind === "tf" && q.answer !== "true" && q.answer !== "false") return `${n}: choose True or False.`;
    if (q.kind === "short" && !q.answer.split("|").some((a) => a.trim())) return `${n} needs at least one accepted answer.`;
  }
  return null;
}
