import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/messages";
import { AppNav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await unreadCount(user.id);
  return (
    <div className="min-h-dvh">
      <AppNav user={{ name: user.name, role: user.role, avatarUrl: user.avatarUrl }} unread={unread} />
      <div className="lg:pl-64">
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-6 lg:pt-8 lg:pb-12">{children}</main>
      </div>
    </div>
  );
}
