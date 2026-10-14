import { requireUser } from "@/lib/auth";
import { listConversations, messageableUsers } from "@/lib/conversations";
import { startConversationFromForm } from "@/lib/actions/community";
import { ConversationList } from "@/components/conversation-list";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const user = await requireUser();
  const [conversations, people] = await Promise.all([listConversations(user.id), messageableUsers(user)]);
  return (
    <>
      <PageHeader title="Messages" subtitle="Chat privately with your teachers and classmates, or start a video call." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-0 lg:col-span-2">
          <ConversationList conversations={conversations} />
        </Card>
        <Card title="New message">
          <form action={startConversationFromForm} className="space-y-3">
            <select name="userId" required defaultValue="" aria-label="Recipient">
              <option value="" disabled>Choose a person…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.role !== "STUDENT" ? ` (${p.role.toLowerCase()})` : ""}</option>
              ))}
            </select>
            <button className="btn-primary w-full">Start conversation</button>
          </form>
        </Card>
      </div>
    </>
  );
}
