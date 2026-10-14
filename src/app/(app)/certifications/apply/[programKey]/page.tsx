import Link from "next/link";
import { getBranding } from "@/lib/branding";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { startApplication } from "@/lib/actions/certifications";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Markdown } from "@/components/markdown";
import { Card, PageHeader, Pill } from "@/components/ui";

export default async function ApplyPage({ params }: { params: Promise<{ programKey: string }> }) {
  const { programKey } = await params;
  const user = await requireUser();
  const org = (await getBranding()).shortName;
  const program = await db.certProgram.findUnique({
    where: { key: programKey },
    include: { levels: { where: { active: true }, orderBy: { position: "asc" } } },
  });
  if (!program?.active) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/certifications" className="link text-sm">← Certifications</Link>
      <PageHeader title={`Apply: ${program.name}`} subtitle="Choose the level you're applying for. You can save your application and come back to it before submitting." />
      <Card>
        <ActionForm action={startApplication.bind(null, program.id)} className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Level</legend>
            {program.levels.map((l, i) => (
              <label key={l.id} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 font-normal has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:border-slate-700 dark:has-[:checked]:bg-brand-950">
                <input type="radio" name="levelId" value={l.id} defaultChecked={i === 0} className="mt-1" />
                <div>
                  <p className="font-semibold">{l.name}{l.lifetime && <span className="ml-2"><Pill tone="purple">Lifetime</Pill></span>}</p>
                  <div className="text-sm"><Markdown>{l.description}</Markdown></div>
                  {l.feeNote && <p className="muted text-xs">Fee: {l.feeNote}</p>}
                </div>
              </label>
            ))}
          </fieldset>
          {program.kind === "CENTER" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="centerName">Learning center name</label>
                <input id="centerName" name="centerName" required />
              </div>
              <div className="field">
                <label htmlFor="institution">Institution</label>
                <input id="institution" name="institution" defaultValue={user.institution ?? ""} required />
              </div>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="institution">Your institution</label>
              <input id="institution" name="institution" defaultValue={user.institution ?? ""} />
            </div>
          )}
          <p className="muted text-xs">Application fees are paid separately through {org}&apos;s online store. An administrator will confirm your payment.</p>
          <SubmitButton pendingText="Starting…">Start application</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
