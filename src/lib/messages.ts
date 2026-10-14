import "server-only";
import { db } from "./db";

/** Number of conversations with messages from others newer than the user's last read time. */
export async function unreadCount(userId: string) {
  const parts = await db.conversationParticipant.findMany({ where: { userId }, select: { conversationId: true, lastReadAt: true } });
  if (!parts.length) return 0;
  const counts = await Promise.all(
    parts.map((p) =>
      db.message.count({ where: { conversationId: p.conversationId, senderId: { not: userId }, createdAt: { gt: p.lastReadAt } }, take: 1 }),
    ),
  );
  return counts.filter((c) => c > 0).length;
}
