import "server-only";
import { notFound } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";

export const ROLE_LABELS: Record<Role, string> = { ADMIN: "Administrator", TEACHER: "Teacher", STUDENT: "Student" };

/** Human-readable list of what each role may do (shown on the profile page). */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  ADMIN: [
    "Manage all users, assign roles and deactivate accounts",
    "Create, edit, publish and delete any course",
    "View platform-wide and per-course analytics",
    "Grade any assessment and moderate any forum",
  ],
  TEACHER: [
    "Create courses and build lessons with text, images, video, charts and embeds",
    "Create quizzes and assignments, and grade submissions",
    "Enroll students and view course analytics",
    "Post announcements, moderate forums and host live classes",
  ],
  STUDENT: [
    "Enroll in published courses from the Learning Center",
    "Complete lessons, take quizzes and submit assignments",
    "View your grades, points, badges and leaderboard rank",
    "Message teachers and classmates and join forum discussions",
  ],
};

export type CourseAccess = {
  course: NonNullable<Awaited<ReturnType<typeof loadCourse>>>;
  canManage: boolean;
  isEnrolled: boolean;
};

function loadCourse(courseId: string) {
  return db.course.findUnique({
    where: { id: courseId },
    include: { teacher: { select: { id: true, name: true, avatarUrl: true, email: true } } },
  });
}

/**
 * Loads a course and determines what the user can do with it.
 * Admins and the course teacher can manage it; enrolled students can view it.
 * Anyone signed in can see a published course's overview (to enroll).
 */
export async function getCourseAccess(user: CurrentUser, courseId: string): Promise<CourseAccess> {
  const course = await loadCourse(courseId);
  if (!course) notFound();
  const canManage = user.role === "ADMIN" || course.teacherId === user.id;
  const enrollment = await db.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
  const isEnrolled = !!enrollment;
  if (!canManage && !course.published && !isEnrolled) notFound();
  return { course, canManage, isEnrolled };
}

/** Course member = manager or enrolled student. Throws 404 otherwise. */
export async function requireCourseMember(user: CurrentUser, courseId: string) {
  const access = await getCourseAccess(user, courseId);
  if (!access.canManage && !access.isEnrolled) notFound();
  return access;
}

export async function requireCourseManager(user: CurrentUser, courseId: string) {
  const access = await getCourseAccess(user, courseId);
  if (!access.canManage) notFound();
  return access;
}
