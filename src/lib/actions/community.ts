"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireCourseManager, requireCourseMember } from "@/lib/permissions";
import { onForumPost } from "@/lib/gamification";
import { messageableUsers } from "@/lib/conversations";
import type { ActionResult } from "@/lib/action-types";

// ─── Forums ──────────────────────────────────────────────────────────────────

export async function createThread(courseId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireCourseMember(user, courseId);
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { error: "Title and message are required." };
  const thread = await db.forumThread.create({ data: { courseId, authorId: user.id, title, body } });
  await onForumPost(user.id, `forum-thread:${thread.id}`, true, courseId);
  redirect(`/courses/${courseId}/forum/${thread.id}`);
}

export async function replyToThread(threadId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const thread = await db.forumThread.findUniqueOrThrow({ where: { id: threadId } });
  await requireCourseMember(user, thread.courseId);
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a reply first." };
  const post = await db.forumPost.create({ data: { threadId, authorId: user.id, body } });
  await db.forumThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
  await onForumPost(user.id, `forum-post:${post.id}`, false, thread.courseId);
  revalidatePath(`/courses/${thread.courseId}/forum/${threadId}`);
  return { ok: "" };
}

export async function deleteThread(threadId: string) {
  const user = await requireUser();
  const thread = await db.forumThread.findUniqueOrThrow({ where: { id: threadId } });
  const { canManage } = await requireCourseMember(user, thread.courseId);
  if (!canManage && thread.authorId !== user.id) return;
  await db.forumThread.delete({ where: { id: threadId } });
  redirect(`/courses/${thread.courseId}/forum`);
}

export async function deletePost(postId: string) {
  const user = await requireUser();
  const post = await db.forumPost.findUniqueOrThrow({ where: { id: postId }, include: { thread: true } });
  const { canManage } = await requireCourseMember(user, post.thread.courseId);
  if (!canManage && post.authorId !== user.id) return;
  await db.forumPost.delete({ where: { id: postId } });
  revalidatePath(`/courses/${post.thread.courseId}/forum/${post.threadId}`);
}

export async function togglePin(threadId: string) {
  const user = await requireUser();
  const thread = await db.forumThread.findUniqueOrThrow({ where: { id: threadId } });
  await requireCourseManager(user, thread.courseId);
  await db.forumThread.update({ where: { id: threadId }, data: { pinned: !thread.pinned, updatedAt: thread.updatedAt } });
  revalidatePath(`/courses/${thread.courseId}/forum`, "layout");
}

// ─── Direct messages ─────────────────────────────────────────────────────────

/** Finds or creates a 1:1 conversation with another user. */
export async function startConversation(otherUserId: string) {
  const user = await requireUser();
  if (otherUserId === user.id) redirect("/messages");
  const allowed = await messageableUsers(user);
  if (!allowed.some((u) => u.id === otherUserId)) redirect("/messages");
  const existing = await db.conversation.findFirst({
    where: {
      AND: [{ participants: { some: { userId: user.id } } }, { participants: { some: { userId: otherUserId } } }],
      participants: { every: { userId: { in: [user.id, otherUserId] } } },
    },
  });
  const conversation =
    existing ??
    (await db.conversation.create({
      data: { participants: { create: [{ userId: user.id }, { userId: otherUserId }] } },
    }));
  redirect(`/messages/${conversation.id}`);
}

export async function startConversationFromForm(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  if (userId) await startConversation(userId);
}

async function requireParticipant(conversationId: string) {
  const user = await requireUser();
  const part = await db.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId: user.id } } });
  if (!part) throw new Error("Not a participant in this conversation");
  return user;
}

export async function sendMessage(conversationId: string, body: string) {
  const user = await requireParticipant(conversationId);
  const text = body.trim().slice(0, 5000);
  if (!text) return;
  const now = new Date();
  await db.$transaction([
    db.message.create({ data: { conversationId, senderId: user.id, body: text, createdAt: now } }),
    db.conversation.update({ where: { id: conversationId }, data: { updatedAt: now } }),
    db.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadAt: now } }),
  ]);
}

export async function fetchMessages(conversationId: string, after?: string) {
  const user = await requireParticipant(conversationId);
  const messages = await db.message.findMany({
    where: { conversationId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
    orderBy: { createdAt: "asc" },
    take: after ? 100 : 200,
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
  });
  await db.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { lastReadAt: new Date() },
  });
  return messages.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt.toISOString(), sender: m.sender, mine: m.senderId === user.id }));
}
