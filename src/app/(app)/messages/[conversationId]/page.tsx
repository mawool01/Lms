import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchMessages } from "@/lib/actions/community";
import { listConversations } from "@/lib/conversations";
import { jitsiRoomUrl } from "@/lib/video";
import { Chat } from "@/components/chat";
import { ConversationList } from "@/components/conversation-list";
import { Avatar, Card, RolePill } from "@/components/ui";

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const user = await requireUser();
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, participants: { some: { userId: user.id } } },
    include: { participants: { include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } } } },
  });
  if (!conversation) notFound();
  const [initial, conversations] = await Promise.all([fetchMessages(conversationId), listConversations(user.id)]);
  const others = conversation.participants.filter((p) => p.userId !== user.id).map((p) => p.user);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="hidden max-h-[calc(100dvh-8rem)] overflow-y-auto p-0 lg:block">
        <ConversationList conversations={conversations} activeId={conversationId} />
      </Card>
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center gap-3">
          <Link href="/messages" className="btn-ghost btn-sm lg:hidden">←</Link>
          {others[0] && <Avatar name={others[0].name} url={others[0].avatarUrl} />}
          <div>
            <Link href={others[0] ? `/users/${others[0].id}` : "#"} className="font-semibold hover:underline">{others.map((o) => o.name).join(", ")}</Link>
            {others[0] && <div><RolePill role={others[0].role} /></div>}
          </div>
        </div>
        <Chat conversationId={conversationId} initial={initial} callUrl={jitsiRoomUrl("dm", conversationId)} />
      </div>
    </div>
  );
}
