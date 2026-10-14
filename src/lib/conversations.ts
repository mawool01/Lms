import "server-only";
import { db } from "./db";

export async function listConversations(userId: string) {
  const convos = await db.conversation.findMany({
    where: { participants: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    include: {
      participants: { include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return convos.map((c) => {
    const me = c.participants.find((p) => p.userId === userId)!;
    const others = c.participants.filter((p) => p.userId !== userId).map((p) => p.user);
    const last = c.messages[0];
    return {
      id: c.id,
      others,
      last,
      unread: !!last && last.senderId !== userId && last.createdAt > me.lastReadAt,
      updatedAt: c.updatedAt,
    };
  });
}

/** People the user can message: classmates and instructors in shared courses (admins/teachers can message anyone). */
export async function messageableUsers(user: { id: string; role: string }) {
  if (user.role !== "STUDENT") {
    return db.user.findMany({ where: { active: true, NOT: { id: user.id } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
  }
  const courses = await db.course.findMany({
    where: { enrollments: { some: { userId: user.id } } },
    select: { teacherId: true, enrollments: { select: { userId: true } } },
  });
  const ids = new Set<string>();
  courses.forEach((c) => {
    ids.add(c.teacherId);
    c.enrollments.forEach((e) => ids.add(e.userId));
  });
  ids.delete(user.id);
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  admins.forEach((a) => a.id !== user.id && ids.add(a.id));
  return db.user.findMany({ where: { id: { in: [...ids] }, active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
}
