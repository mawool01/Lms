import "server-only";
import { db } from "@/lib/db";

/** Who can do what with a package: managers (course teacher/admin) or enrolled learners. */
export async function packageAccess(userId: string, packageId: string) {
  const pkg = await db.scormPackage.findUnique({
    where: { id: packageId },
    include: { course: { select: { teacherId: true } } },
  });
  if (!pkg) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, active: true, name: true } });
  if (!user?.active) return null;
  const canManage = user.role === "ADMIN" || pkg.course.teacherId === userId;
  const isEnrolled = !!(await db.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: pkg.courseId } } }));
  if (!canManage && !(isEnrolled && pkg.published)) return null;
  return { pkg, user, canManage, isEnrolled };
}

// Short-lived per-instance cache so serving the hundreds of files in a package
// doesn't hit the database on every request.
const cache = new Map<string, { pkg: { id: string; storage: string; storageBase: string }; exp: number }>();

export async function cachedContentAccess(userId: string, packageId: string) {
  const key = `${userId}:${packageId}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.pkg;
  const access = await packageAccess(userId, packageId);
  if (!access) return null;
  const pkg = { id: access.pkg.id, storage: access.pkg.storage, storageBase: access.pkg.storageBase };
  if (cache.size > 5000) cache.clear();
  cache.set(key, { pkg, exp: Date.now() + 60_000 });
  return pkg;
}
