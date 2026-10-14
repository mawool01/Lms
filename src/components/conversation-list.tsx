import Link from "next/link";
import { Avatar } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";
import type { listConversations } from "@/lib/conversations";

export function ConversationList({ conversations, activeId }: { conversations: Awaited<ReturnType<typeof listConversations>>; activeId?: string }) {
  if (!conversations.length) return <p className="muted p-4 text-sm">No conversations yet.</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {conversations.map((c) => {
        const name = c.others.map((o) => o.name).join(", ") || "Just you";
        return (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className={cn("flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50", c.id === activeId && "bg-brand-50 dark:bg-brand-950/40")}>
              <Avatar name={c.others[0]?.name ?? "?"} url={c.others[0]?.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <p className={cn("truncate text-sm", c.unread ? "font-bold" : "font-medium")}>{name}</p>
                  <span className="muted shrink-0 text-xs">{timeAgo(c.last?.createdAt ?? c.updatedAt)}</span>
                </div>
                <p className={cn("truncate text-xs", c.unread ? "font-semibold" : "muted")}>{c.last?.body ?? "No messages yet"}</p>
              </div>
              {c.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
