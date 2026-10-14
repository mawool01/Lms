import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { canEditRubric } from "@/lib/rubric-access";
import { parseCriteria } from "@/lib/rubrics";
import { RubricEditor } from "@/components/rubrics/rubric-editor";

export default async function EditRubricPage({ params }: { params: Promise<{ rubricId: string }> }) {
  const { rubricId } = await params;
  const user = await requireRole("ADMIN", "TEACHER");
  const r = await db.rubric.findUnique({ where: { id: rubricId } });
  if (!r || !canEditRubric(user, r)) notFound();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href={`/rubrics/${r.id}`} className="link text-sm">← Back to rubric</Link>
      <h1 className="text-2xl font-bold">Edit rubric</h1>
      <RubricEditor rubricId={r.id} initial={{ title: r.title, description: r.description, criteria: parseCriteria(r.criteria) }} />
    </div>
  );
}
