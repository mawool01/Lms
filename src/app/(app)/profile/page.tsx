import Link from "next/link";
import { getBranding } from "@/lib/branding";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { levelFor, totalPoints } from "@/lib/gamification";
import { changePassword, updatePreferences, updateProfile } from "@/lib/actions/users";
import { ActionForm, SubmitButton } from "@/components/forms";
import { waEnabled } from "@/lib/wildapricot";
import { formatDate } from "@/lib/utils";
import { BadgeGrid } from "@/components/badge-grid";
import { Avatar, Card, PageHeader, ProgressBar, RolePill } from "@/components/ui";

export const metadata = { title: "Profile & settings" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ wa?: string; waerror?: string }> }) {
  const { wa, waerror } = await searchParams;
  const user = await requireUser();
  const org = (await getBranding()).shortName;
  const hasPassword = !!(await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } }))?.passwordHash;
  const [points, badges] = await Promise.all([
    totalPoints(user.id),
    db.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } }),
  ]);
  const level = levelFor(points);

  return (
    <>
      <PageHeader title="Profile & settings" actions={<Link href="/portfolio" className="btn-secondary">🗂️ My portfolio</Link>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile">
            <div className="mb-5 flex items-center gap-4">
              <Avatar name={user.name} url={user.avatarUrl} size={64} />
              <div>
                <p className="text-lg font-semibold">{user.name}</p>
                <p className="muted text-sm">{user.email}</p>
                <RolePill role={user.role} />
              </div>
            </div>
            <ActionForm action={updateProfile} className="space-y-4">
              <div className="field">
                <label htmlFor="name">Display name</label>
                <input id="name" name="name" defaultValue={user.name} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="field">
                  <label htmlFor="jobTitle">Job title</label>
                  <input id="jobTitle" name="jobTitle" defaultValue={user.jobTitle ?? ""} placeholder="e.g. Director of Tutoring" />
                </div>
                <div className="field">
                  <label htmlFor="institution">Institution</label>
                  <input id="institution" name="institution" defaultValue={user.institution ?? ""} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="avatarUrl">Photo URL</label>
                <input id="avatarUrl" name="avatarUrl" type="url" defaultValue={user.avatarUrl ?? ""} placeholder="https://…" />
              </div>
              <div className="field">
                <label htmlFor="bio">About me</label>
                <textarea id="bio" name="bio" rows={3} defaultValue={user.bio ?? ""} maxLength={1000} />
              </div>
              <SubmitButton>Save profile</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Preferences">
            <ActionForm action={updatePreferences} className="space-y-4">
              <div className="field sm:max-w-xs">
                <label htmlFor="theme">Appearance</label>
                <select id="theme" name="theme" defaultValue={user.theme}>
                  <option value="SYSTEM">Match my device</option>
                  <option value="LIGHT">Light</option>
                  <option value="DARK">Dark</option>
                </select>
              </div>
              <label className="flex items-center gap-2 font-normal">
                <input type="checkbox" name="showOnLeaderboard" defaultChecked={user.showOnLeaderboard} /> Show me on leaderboards
              </label>
              <SubmitButton>Save preferences</SubmitButton>
            </ActionForm>
          </Card>

          <Card title={hasPassword ? "Change password" : "Set a password"}>
            {!hasPassword && <p className="muted mb-3 text-sm">You sign in with Wild Apricot. Optionally set a password to also sign in with your email.</p>}
            <ActionForm action={changePassword} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              {hasPassword ? (
                <div className="field">
                  <label htmlFor="current">Current password</label>
                  <input id="current" name="current" type="password" autoComplete="current-password" required />
                </div>
              ) : (
                <span className="hidden sm:block" />
              )}
              <div className="field">
                <label htmlFor="next">New password</label>
                <input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
              </div>
              <SubmitButton className="btn-secondary">Update</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-6">
          {(waEnabled() || user.waContactId) && (
            <Card title="Wild Apricot">
              {waerror && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{waerror}</p>}
              {wa === "connected" && <p className="mb-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Connected! You can now sign in with Wild Apricot.</p>}
              {user.waContactId ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="muted">Status</dt><dd>✅ Connected</dd>
                  <dt className="muted">Membership</dt><dd>{user.waMembershipLevel ?? "Not a member"}</dd>
                  {user.waMembershipStatus && (<><dt className="muted">Member status</dt><dd>{user.waMembershipStatus}</dd></>)}
                  {user.waSyncedAt && (<><dt className="muted">Last synced</dt><dd>{formatDate(user.waSyncedAt)}</dd></>)}
                </dl>
              ) : (
                <>
                  <p className="muted mb-3 text-sm">Connect your {org} Wild Apricot login so you can sign in with it and keep your membership in sync.</p>
                  <a href="/auth/wildapricot/start?link=1" className="btn-secondary w-full">Connect Wild Apricot</a>
                </>
              )}
              <p className="muted mt-3 text-xs">Membership details refresh each time you sign in with Wild Apricot.</p>
            </Card>
          )}
          <Card title="Your role & permissions">
            <p className="mb-3 font-semibold">{ROLE_LABELS[user.role]}</p>
            <ul className="space-y-2 text-sm">
              {ROLE_PERMISSIONS[user.role].map((p) => (
                <li key={p} className="flex gap-2"><span className="text-emerald-500">✔</span>{p}</li>
              ))}
            </ul>
            <p className="muted mt-4 text-xs">Roles are assigned by an {org} administrator.</p>
          </Card>
          {user.role === "STUDENT" && (
            <Card title="Level">
              <p className="text-2xl font-bold">{points.toLocaleString()} pts</p>
              <p className="muted mb-2 text-sm">Level {level.level} · {level.name}</p>
              <ProgressBar value={level.progress} />
            </Card>
          )}
        </div>
      </div>
      {user.role === "STUDENT" && (
        <Card title={`Badges (${badges.length}/${8})`} className="mt-6">
          <BadgeGrid earned={badges.map((b) => ({ key: b.badge.key, awardedAt: b.awardedAt }))} />
        </Card>
      )}
    </>
  );
}
