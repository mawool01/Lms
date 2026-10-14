import "server-only";
import { db } from "@/lib/db";

/**
 * Who may open a privately stored upload (served at /files/<pathname>):
 *  - uploads/ (lesson media): any signed-in user
 *  - submissions/<userId>/…: the student, admins, and the teacher of a course whose submission references it
 *  - cert-evidence/<userId>/…: the applicant, admins, and reviewers assigned to an application referencing it
 */
export async function canReadUpload(userId: string, pathname: string): Promise<boolean> {
  const [folder, owner] = pathname.split("/");
  if (folder === "uploads") return true;
  if (folder !== "submissions" && folder !== "cert-evidence") return false;
  if (owner === userId) return true;
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, active: true } });
  if (!user?.active) return false;
  if (user.role === "ADMIN") return true;
  const suffix = `%/${pathname}`;
  if (folder === "submissions") {
    const rows = await db.$queryRaw<{ ok: number }[]>`
      SELECT 1 AS ok FROM "Submission" s
      JOIN "Assignment" a ON a.id = s."assignmentId"
      JOIN "Course" c ON c.id = a."courseId"
      WHERE c."teacherId" = ${userId} AND EXISTS (SELECT 1 FROM unnest(s.files) f WHERE f LIKE ${suffix})
      LIMIT 1`;
    return rows.length > 0;
  }
  const rows = await db.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok FROM "CertResponse" r
    JOIN "CertReview" v ON v."applicationId" = r."applicationId"
    WHERE v."reviewerId" = ${userId} AND EXISTS (SELECT 1 FROM unnest(r.evidence) e WHERE e LIKE ${suffix})
    LIMIT 1`;
  return rows.length > 0;
}
