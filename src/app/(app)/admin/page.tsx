import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminCreateUser, adminImportUsers, adminResetPassword, adminSetRole, adminToggleActive } from "@/lib/actions/users";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Card, PageHeader, Pill, Stat } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Administration" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string }> }) {
  const admin = await requireRole("ADMIN");
  const { q = "", role = "" } = await searchParams;
  const where: Prisma.UserWhereInput = {
    ...(role ? { role: role as Role } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [users, counts, courseCount, publishedCount, enrollmentCount, attemptCount] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      take: 200,
      select: { id: true, name: true, email: true, role: true, active: true, avatarUrl: true, createdAt: true, waContactId: true, waMembershipLevel: true, waMembershipStatus: true, _count: { select: { enrollments: true, coursesTaught: true } } },
    }),
    db.user.groupBy({ by: ["role"], _count: true }),
    db.course.count(),
    db.course.count({ where: { published: true } }),
    db.enrollment.count(),
    db.quizAttempt.count(),
  ]);
  const roleCount = (r: Role) => counts.find((c) => c.role === r)?._count ?? 0;

  return (
    <>
      <PageHeader title="Administration" subtitle="Manage people, roles and the platform." actions={<><Link href="/admin/certifications" className="btn-primary">🎖️ Certifications</Link><Link href="/courses" className="btn-secondary">All courses</Link></>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Students" value={roleCount("STUDENT")} />
        <Stat label="Teachers" value={roleCount("TEACHER")} />
        <Stat label="Admins" value={roleCount("ADMIN")} />
        <Stat label="Courses" value={courseCount} hint={`${publishedCount} published`} />
        <Stat label="Enrollments" value={enrollmentCount} />
        <Stat label="Quiz attempts" value={attemptCount} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Users" className="lg:col-span-2">
          <form className="mb-4 flex flex-col gap-2 sm:flex-row">
            <input name="q" defaultValue={q} placeholder="Search name or email" />
            <select name="role" defaultValue={role} className="sm:w-40">
              <option value="">All roles</option>
              <option value="STUDENT">Students</option>
              <option value="TEACHER">Teachers</option>
              <option value="ADMIN">Admins</option>
            </select>
            <button className="btn-secondary">Filter</button>
          </form>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => (
              <li key={u.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={u.name} url={u.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/users/${u.id}`} className="font-medium hover:underline">{u.name}</Link>
                    {!u.active && <span className="ml-2"><Pill tone="red">Deactivated</Pill></span>}
                    {u.waContactId && (
                      <span className="ml-2" title={u.waMembershipStatus ? `Wild Apricot status: ${u.waMembershipStatus}` : "Connected to Wild Apricot"}>
                        <Pill tone={u.waMembershipStatus === "Active" ? "green" : "gray"}>🌿 {u.waMembershipLevel ?? "WA contact"}{u.waMembershipStatus && u.waMembershipStatus !== "Active" ? ` · ${u.waMembershipStatus}` : ""}</Pill>
                      </span>
                    )}
                    <p className="muted truncate text-xs">
                      {u.email} · joined {formatDate(u.createdAt)} · {u.role === "STUDENT" ? `${u._count.enrollments} courses` : `${u._count.coursesTaught} taught`}
                    </p>
                  </div>
                  {u.id === admin.id ? (
                    <Pill tone="purple">You</Pill>
                  ) : (
                    <div className="flex items-center gap-1">
                      <form action={adminSetRole.bind(null, u.id)} className="flex gap-1">
                        <select name="role" defaultValue={u.role} className="w-28 py-1 text-xs" aria-label="Role">
                          <option value="STUDENT">Student</option>
                          <option value="TEACHER">Teacher</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <button className="btn-secondary btn-sm">Set</button>
                      </form>
                      <details className="relative">
                        <summary className="btn-ghost btn-sm cursor-pointer list-none">⋯</summary>
                        <div className="card absolute right-0 z-10 mt-1 w-64 space-y-3 p-3">
                          <ActionForm action={adminResetPassword.bind(null, u.id)} className="space-y-2">
                            <input name="password" type="text" placeholder="New temporary password" aria-label="New password" minLength={8} required />
                            <SubmitButton className="btn-secondary btn-sm w-full">Reset password</SubmitButton>
                          </ActionForm>
                          <form action={adminToggleActive.bind(null, u.id)}>
                            <button className={u.active ? "btn-danger btn-sm w-full" : "btn-primary btn-sm w-full"}>{u.active ? "Deactivate account" : "Reactivate account"}</button>
                          </form>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </li>
            ))}
            {users.length === 0 && <li className="muted py-6 text-center text-sm">No users match.</li>}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card title="Add a user">
            <ActionForm action={adminCreateUser} resetOnSuccess className="space-y-3">
              <input name="name" placeholder="Full name" aria-label="Full name" required />
              <input name="email" type="email" placeholder="Email" aria-label="Email" required />
              <input name="password" type="text" placeholder="Temporary password" aria-label="Temporary password" minLength={8} required />
              <select name="role" defaultValue="STUDENT" aria-label="Role">
                <option value="STUDENT">Student</option>
                <option value="TEACHER">Teacher</option>
                <option value="ADMIN">Admin</option>
              </select>
              <SubmitButton>Create user</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Bulk import">
            <ActionForm action={adminImportUsers} className="space-y-3">
              <textarea name="csv" rows={6} placeholder={"Jane Doe, jane@iclca.org, student\nJohn Smith, john@iclca.org, teacher"} className="font-mono text-xs" aria-label="Users CSV" required />
              <input name="password" type="text" placeholder="Temporary password for all" aria-label="Temporary password" minLength={8} required />
              <p className="muted text-xs">One per line: name, email, role (student/teacher/admin). Ask users to change their password after first sign-in.</p>
              <SubmitButton>Import users</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
