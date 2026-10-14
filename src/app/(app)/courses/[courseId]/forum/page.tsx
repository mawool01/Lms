import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { createThread } from "@/lib/actions/community";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Card, EmptyState, Pill } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export default async function ForumPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  await requireCourseMember(user, courseId);
  const threads = await db.forumThread.findMany({
    where: { courseId },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    include: { author: { select: { name: true, avatarUrl: true, role: true } }, _count: { select: { posts: true } } },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {threads.length === 0 && <EmptyState icon="💬" title="No discussions yet">Start the first conversation!</EmptyState>}
        {threads.map((t) => (
          <Link key={t.id} href={`/courses/${courseId}/forum/${t.id}`} className="card flex gap-3 p-4 transition hover:shadow-md">
            <Avatar name={t.author.name} url={t.author.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {t.pinned && <Pill tone="yellow">📌 Pinned</Pill>}
                <p className="font-semibold">{t.title}</p>
              </div>
              <p className="muted line-clamp-2 text-sm">{t.body}</p>
              <p className="muted mt-1 text-xs">
                {t.author.name}{t.author.role !== "STUDENT" && " (instructor)"} · {t._count.posts} {t._count.posts === 1 ? "reply" : "replies"} · active {timeAgo(t.updatedAt)}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <Card title="Start a discussion">
        <ActionForm action={createThread.bind(null, courseId)} className="space-y-3">
          <input name="title" placeholder="Topic" aria-label="Topic" required />
          <textarea name="body" rows={5} placeholder="Ask a question or share an idea…" aria-label="Message" required />
          <SubmitButton>Post · +5 pts</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
