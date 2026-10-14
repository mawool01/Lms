import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCourseMember } from "@/lib/permissions";
import { deletePost, deleteThread, replyToThread, togglePin } from "@/lib/actions/community";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Markdown } from "@/components/markdown";
import { Avatar, Card, Pill } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export default async function ThreadPage({ params }: { params: Promise<{ courseId: string; threadId: string }> }) {
  const { courseId, threadId } = await params;
  const user = await requireUser();
  const { canManage, course } = await requireCourseMember(user, courseId);
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      posts: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, avatarUrl: true } } } },
    },
  });
  if (!thread || thread.courseId !== courseId) notFound();
  const isInstructor = (id: string) => id === course.teacherId;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/courses/${courseId}/forum`} className="link text-sm">← All discussions</Link>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold">{thread.pinned && "📌 "}{thread.title}</h2>
          <div className="flex gap-1">
            {canManage && <form action={togglePin.bind(null, threadId)}><button className="btn-ghost btn-sm">{thread.pinned ? "Unpin" : "Pin"}</button></form>}
            {(canManage || thread.authorId === user.id) && (
              <form action={deleteThread.bind(null, threadId)}><button className="btn-ghost btn-sm text-red-600">Delete</button></form>
            )}
          </div>
        </div>
        <PostMeta author={thread.author} date={thread.createdAt} instructor={isInstructor(thread.author.id)} />
        <div className="mt-3"><Markdown>{thread.body}</Markdown></div>
      </Card>
      {thread.posts.map((p) => (
        <div key={p.id} className="card ml-4 p-4 sm:ml-8">
          <div className="flex items-start justify-between">
            <PostMeta author={p.author} date={p.createdAt} instructor={isInstructor(p.author.id)} />
            {(canManage || p.authorId === user.id) && (
              <form action={deletePost.bind(null, p.id)}><button className="muted text-xs hover:text-red-600" title="Delete">✕</button></form>
            )}
          </div>
          <div className="mt-2"><Markdown>{p.body}</Markdown></div>
        </div>
      ))}
      <Card title="Reply">
        <ActionForm action={replyToThread.bind(null, threadId)} resetOnSuccess className="space-y-3">
          <textarea name="body" rows={4} placeholder="Write a reply… (Markdown supported)" aria-label="Reply" required />
          <SubmitButton>Post reply · +2 pts</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

function PostMeta({ author, date, instructor }: { author: { id: string; name: string; avatarUrl: string | null }; date: Date; instructor: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Avatar name={author.name} url={author.avatarUrl} size={28} />
      <Link href={`/users/${author.id}`} className="font-medium hover:underline">{author.name}</Link>
      {instructor && <Pill tone="brand">Instructor</Pill>}
      <span className="muted text-xs">{timeAgo(date)}</span>
    </div>
  );
}
