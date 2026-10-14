import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { levelFor, totalPoints } from "@/lib/gamification";
import { changePassword, updatePreferences, updateProfile } from "@/lib/actions/users";
import { ActionForm, SubmitButton } from "@/components/forms";
import { BadgeGrid } from "@/components/badge-grid";
import { Avatar, Card, PageHeader, ProgressBar, RolePill } from "@/components/ui";

export const metadata = { title: "Profile & settings" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [points, badges] = await Promise.all([
    totalPoints(user.id),
    db.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } }),
  ]);
  const level = levelFor(points);

  return (
    <>
      <PageHeader title="Profile & settings" />
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

          <Card title="Change password">
            <ActionForm action={changePassword} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="field">
                <label htmlFor="current">Current password</label>
                <input id="current" name="current" type="password" autoComplete="current-password" required />
              </div>
              <div className="field">
                <label htmlFor="next">New password</label>
                <input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
              </div>
              <SubmitButton className="btn-secondary">Update</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Your role & permissions">
            <p className="mb-3 font-semibold">{ROLE_LABELS[user.role]}</p>
            <ul className="space-y-2 text-sm">
              {ROLE_PERMISSIONS[user.role].map((p) => (
                <li key={p} className="flex gap-2"><span className="text-emerald-500">✔</span>{p}</li>
              ))}
            </ul>
            <p className="muted mt-4 text-xs">Roles are assigned by an ICLCA administrator.</p>
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
