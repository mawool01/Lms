import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { initialCmi } from "@/lib/scorm/tracking";
import { ScormPlayer } from "@/components/scorm/scorm-player";

export const metadata = { title: "SCORM activity" };

export default async function ScormPlayPage({ params }: { params: Promise<{ courseId: string; packageId: string }> }) {
  const { courseId, packageId } = await params;
  const user = await requireUser();
  const { canManage, isEnrolled } = await requireCourseMember(user, courseId);
  const pkg = await db.scormPackage.findUnique({ where: { id: packageId } });
  if (!pkg || pkg.courseId !== courseId || (!pkg.published && !canManage)) notFound();

  // Enrolled learners are tracked; instructors get a no-credit preview.
  const tracked = isEnrolled;
  const attempt = tracked ? await db.scormAttempt.findUnique({ where: { packageId_userId: { packageId, userId: user.id } } }) : null;
  const cmi = initialCmi(pkg, user, attempt, tracked ? "normal" : "browse");
  const launchUrl = `/scorm-content/${pkg.id}/${pkg.launchPath.split("/").map(encodeURIComponent).join("/")}${pkg.launchParams ? `?${pkg.launchParams}` : ""}`;
  const backHref = `/courses/${courseId}/scorm/${packageId}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Link href={backHref} className="link text-sm">← {pkg.title}</Link>
      </div>
      <ScormPlayer packageId={pkg.id} version={pkg.version} launchUrl={launchUrl} initial={cmi} preview={!tracked} backHref={backHref} />
    </div>
  );
}
