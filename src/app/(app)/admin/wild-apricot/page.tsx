import Link from "next/link";
import type { WaLinkKind } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { WaError, waAdminEnabled, waConfig, waEnabled } from "@/lib/wildapricot";
import {
  type WaEventSummary,
  type WaGroupSummary,
  type WaLevelSummary,
  waListEvents,
  waListMemberGroups,
  waListMembershipLevels,
} from "@/lib/wildapricot-admin";
import { isLinkRevocable } from "@/lib/wildapricot-rules";
import { linkCourseWaLink, syncAllWaEnrollments } from "@/lib/actions/wildapricot";
import { ActionForm, LocalTime, SubmitButton } from "@/components/forms";
import { Card, EmptyState, PageHeader, Pill, Stat } from "@/components/ui";
import type { WaSyncChange, WaSyncUnmatched } from "@/lib/wildapricot-sync";

export const metadata = { title: "Wild Apricot" };

type RunDetail = {
  enrolled?: WaSyncChange[];
  revoked?: WaSyncChange[];
  unmatched?: WaSyncUnmatched[];
  skippedRevocation?: { courseCode: string; reason: string }[];
  errors?: string[];
};

const KIND_LABELS: Record<WaLinkKind, string> = { EVENT: "Event", GROUP: "Member group", LEVEL: "Membership level" };
const KIND_ICONS: Record<WaLinkKind, string> = { EVENT: "📅", GROUP: "👥", LEVEL: "🎟️" };
const TABS: { key: WaLinkKind; label: string }[] = [
  { key: "EVENT", label: "📅 Events" },
  { key: "GROUP", label: "👥 Member groups" },
  { key: "LEVEL", label: "🎟️ Membership levels" },
];

export default async function AdminWildApricotPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; upcoming?: string; browse?: string }>;
}) {
  await requireRole("ADMIN");
  const { q = "", upcoming = "1", browse = "EVENT" } = await searchParams;
  const kind: WaLinkKind = browse === "GROUP" || browse === "LEVEL" ? browse : "EVENT";
  const configured = waAdminEnabled();

  const [links, lastRun, courses] = await Promise.all([
    db.courseWaLink.findMany({
      orderBy: [{ kind: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }],
      include: { course: { select: { id: true, code: true, title: true } } },
    }),
    db.waSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    db.course.findMany({ orderBy: { title: "asc" }, select: { id: true, code: true, title: true } }),
  ]);

  // Only call Wild Apricot for the tab actually being looked at.
  let events: WaEventSummary[] | null = null;
  let groups: WaGroupSummary[] | null = null;
  let levels: WaLevelSummary[] | null = null;
  let browseError: string | null = null;
  if (configured) {
    try {
      if (kind === "EVENT") events = await waListEvents({ q, from: upcoming === "1" ? new Date() : undefined });
      else if (kind === "GROUP") groups = await waListMemberGroups();
      else levels = await waListMembershipLevels();
    } catch (e) {
      browseError = e instanceof WaError ? e.message : "Couldn't load that list from Wild Apricot.";
    }
  }

  const detail = (lastRun?.detail ?? {}) as RunDetail;
  const linked = new Set(links.map((l) => `${l.kind}:${l.waId}`));
  const tabHref = (k: WaLinkKind) => `/admin/wild-apricot?browse=${k}`;

  return (
    <>
      <PageHeader
        title="Wild Apricot"
        subtitle="Enroll people automatically from events, member groups and membership levels."
        actions={<Link href="/admin" className="btn-secondary">← Administration</Link>}
      />

      {!configured && (
        <Card className="mb-6">
          <p className="font-medium">Wild Apricot sync isn&apos;t set up yet.</p>
          <p className="muted mt-2 text-sm">
            In the Wild Apricot admin view go to <strong>Apps → Authorized applications</strong> and open your{" "}
            <strong>server application</strong> (or authorize a new one). The <strong>API key is shown under the
            Application name field</strong>, above the client id and secret — it&apos;s the same screen you got those
            from. Set it as <code>WILDAPRICOT_API_KEY</code> here and redeploy.
          </p>
          <p className="muted mt-2 text-sm">
            That application needs access to <strong>events and contacts</strong>; one restricted to &ldquo;Wild Apricot
            login&rdquo; can sign people in but can&apos;t read registrations or groups.
            {!waEnabled() && " Sign-on isn't configured either (WILDAPRICOT_URL / CLIENT_ID / CLIENT_SECRET)."}
          </p>
        </Card>
      )}

      {configured && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Links" value={links.length} hint={`${links.filter((l) => l.active).length} active`} />
            <Stat label="People covered" value={lastRun?.registrations ?? 0} hint="last sync" />
            <Stat label="Enrolled" value={lastRun?.enrolled ?? 0} hint="last sync" />
            <Stat label="Removed" value={lastRun?.revoked ?? 0} hint="last sync" />
            <Stat label="No LMS account" value={lastRun?.unmatched ?? 0} hint="last sync" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card
              title="Last sync"
              className="lg:col-span-2"
              action={
                lastRun ? (
                  <span className="muted text-xs">
                    <LocalTime date={lastRun.startedAt} /> · {lastRun.trigger.toLowerCase().replace("_", " ")}
                  </span>
                ) : undefined
              }
            >
              {!lastRun ? (
                <p className="muted text-sm">The sync hasn&apos;t run yet. It runs nightly, or use the buttons opposite.</p>
              ) : (
                <>
                  <p className="text-sm">
                    {lastRun.summary} {lastRun.dryRun && <Pill tone="gray">preview only</Pill>}{" "}
                    {!lastRun.ok && <Pill tone="red">had problems</Pill>}
                  </p>
                  {detail.skippedRevocation?.length ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                      <p className="font-medium">Removals were held back</p>
                      <ul className="muted mt-1 space-y-1 text-xs">
                        {detail.skippedRevocation.map((s, i) => (
                          <li key={i}>
                            {s.courseCode}: {s.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {detail.errors?.length ? (
                    <ul className="mt-3 space-y-1 text-xs text-red-600 dark:text-red-400">
                      {detail.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  ) : null}
                  {detail.enrolled?.length ? (
                    <>
                      <h3 className="mt-4 mb-1 text-sm font-semibold">Enrolled</h3>
                      <ul className="muted space-y-1 text-xs">
                        {detail.enrolled.slice(0, 25).map((c, i) => (
                          <li key={i}>
                            {c.userName} → {c.courseCode}
                            {c.matchedBy === "email" && <span className="opacity-60"> (matched by email)</span>}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {detail.revoked?.length ? (
                    <>
                      <h3 className="mt-4 mb-1 text-sm font-semibold">Access removed</h3>
                      <ul className="muted space-y-1 text-xs">
                        {detail.revoked.slice(0, 25).map((c, i) => (
                          <li key={i}>
                            {c.userName} ✕ {c.courseCode}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </>
              )}
            </Card>

            <Card title="Run the sync">
              <p className="muted mb-3 text-sm">
                Runs automatically each night at 09:00 UTC. Preview first if you&apos;ve just changed the links.
              </p>
              <ActionForm action={syncAllWaEnrollments} className="space-y-2">
                <input type="hidden" name="dryRun" value="1" />
                <SubmitButton className="btn-secondary w-full" pendingText="Checking…">Preview (changes nothing)</SubmitButton>
              </ActionForm>
              <ActionForm action={syncAllWaEnrollments} className="mt-2 space-y-2">
                <SubmitButton className="btn-primary w-full" pendingText="Syncing…">Sync now</SubmitButton>
              </ActionForm>
              <ActionForm
                action={syncAllWaEnrollments}
                className="mt-2"
                confirm="Force removes learners even when the sync thinks an unusually large number would lose access. Continue?"
              >
                <input type="hidden" name="force" value="1" />
                <SubmitButton className="btn-secondary w-full text-xs" pendingText="Syncing…">Sync now (force removals)</SubmitButton>
              </ActionForm>
              <dl className="muted mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                <div className="flex justify-between">
                  <dt>Account</dt>
                  <dd>{waConfig().accountId || "from API key"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Match by email</dt>
                  <dd>{process.env.WILDAPRICOT_SYNC_EMAIL_MATCH !== "false" ? "on" : "off"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Nightly job</dt>
                  <dd>{process.env.CRON_SECRET ? "enabled" : "needs CRON_SECRET"}</dd>
                </div>
              </dl>
            </Card>
          </div>

          {detail.unmatched?.length ? (
            <Card
              className="mt-6"
              title="In Wild Apricot, but no LMS account"
              action={<span className="muted text-xs">{lastRun?.unmatched} at the last sync</span>}
            >
              <p className="muted mb-3 text-sm">
                These people are covered by a link but couldn&apos;t be matched to an account. Create accounts for them in{" "}
                <Link href="/admin" className="underline">Administration</Link> (bulk import takes <code>name, email</code> per
                line) and the next sync will enroll them.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="muted text-left text-xs uppercase">
                    <tr>
                      <th className="py-1 pr-3">Name</th>
                      <th className="py-1 pr-3">Email</th>
                      <th className="py-1 pr-3">Course</th>
                      <th className="py-1 pr-3">Via</th>
                      <th className="py-1">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.unmatched.map((u, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-3">{u.name}</td>
                        <td className="py-1.5 pr-3">{u.email ?? <span className="muted">—</span>}</td>
                        <td className="py-1.5 pr-3">{u.courseCode}</td>
                        <td className="muted py-1.5 pr-3 text-xs">
                          {KIND_ICONS[u.kind]} {u.waId}
                        </td>
                        <td className="muted py-1.5 text-xs">
                          {u.reason === "no-contact-id" ? "no Wild Apricot contact" : "no LMS account with that email"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted mt-3 text-xs">
                Copy these addresses:{" "}
                {detail.unmatched
                  .map((u) => u.email)
                  .filter(Boolean)
                  .join(", ") || "none have an email address"}
              </p>
            </Card>
          ) : null}

          <Card className="mt-6" title="Everything linked" action={<span className="muted text-xs">Manage each one on its course&apos;s Settings tab</span>}>
            {!links.length ? (
              <EmptyState icon="🌿" title="Nothing linked yet">
                Pick an event, member group or membership level below, choose a course and link it — or do it from a
                course&apos;s Settings tab.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="muted text-left text-xs uppercase">
                    <tr>
                      <th className="py-1 pr-3">In Wild Apricot</th>
                      <th className="py-1 pr-3">Kind</th>
                      <th className="py-1 pr-3">Course</th>
                      <th className="py-1 pr-3">Covered</th>
                      <th className="py-1 pr-3">Last synced</th>
                      <th className="py-1">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-3">
                          {KIND_ICONS[l.kind]} {l.name || `${KIND_LABELS[l.kind]} ${l.waId}`}{" "}
                          <span className="muted text-xs">#{l.waId}</span>
                        </td>
                        <td className="muted py-1.5 pr-3 text-xs">{KIND_LABELS[l.kind]}</td>
                        <td className="py-1.5 pr-3">
                          <Link href={`/courses/${l.courseId}/settings`} className="underline">
                            {l.course.code}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3">{l.lastCount ?? <span className="muted">—</span>}</td>
                        <td className="muted py-1.5 pr-3 text-xs">
                          {l.lastSyncedAt ? <LocalTime date={l.lastSyncedAt} /> : "never"}
                        </td>
                        <td className="py-1.5">
                          {!l.active && <Pill tone="gray">paused</Pill>}
                          {l.active && !isLinkRevocable(l) && <Pill tone="yellow">keeps access</Pill>}
                          {l.active && isLinkRevocable(l) && <Pill tone="green">syncing</Pill>}
                          {l.lastError && <span className="ml-1 text-xs text-red-600 dark:text-red-400">{l.lastError}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="mt-6" title="Browse Wild Apricot">
            <div className="mb-4 flex flex-wrap gap-2">
              {TABS.map((t) => (
                <Link
                  key={t.key}
                  href={tabHref(t.key)}
                  className={t.key === kind ? "btn-primary text-xs" : "btn-secondary text-xs"}
                >
                  {t.label}
                </Link>
              ))}
            </div>

            {kind === "EVENT" && (
              <form className="mb-4 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="browse" value="EVENT" />
                <input name="q" defaultValue={q} placeholder="Search event names" />
                <label className="flex items-center gap-2 text-sm font-normal whitespace-nowrap">
                  <input type="checkbox" name="upcoming" value="1" defaultChecked={upcoming === "1"} /> Current &amp; upcoming only
                </label>
                <SubmitButton className="btn-secondary">Search</SubmitButton>
              </form>
            )}

            {browseError && <p className="text-sm text-red-600 dark:text-red-400">{browseError}</p>}

            {!browseError && (
              <div className="space-y-2">
                {(kind === "EVENT" ? events : kind === "GROUP" ? groups : levels)?.length === 0 && (
                  <p className="muted text-sm">Nothing to show.</p>
                )}
                {events?.slice(0, 40).map((e) => (
                  <LinkRow
                    key={e.id}
                    kind="EVENT"
                    waId={e.id}
                    title={e.name}
                    subtitle={[e.location, e.registrationsLimit ? `limit ${e.registrationsLimit}` : null].filter(Boolean).join(" · ")}
                    date={e.startDate}
                    linked={linked.has(`EVENT:${e.id}`)}
                    courses={courses}
                  />
                ))}
                {groups?.map((g) => (
                  <LinkRow
                    key={g.id}
                    kind="GROUP"
                    waId={g.id}
                    title={g.name}
                    subtitle={[g.description, g.contactsCount !== null ? `${g.contactsCount} members` : null].filter(Boolean).join(" · ")}
                    linked={linked.has(`GROUP:${g.id}`)}
                    courses={courses}
                  />
                ))}
                {levels?.map((l) => (
                  <LinkRow
                    key={l.id}
                    kind="LEVEL"
                    waId={l.id}
                    title={l.name}
                    subtitle={l.type ?? ""}
                    linked={linked.has(`LEVEL:${l.id}`)}
                    courses={courses}
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function LinkRow({
  kind,
  waId,
  title,
  subtitle,
  date,
  linked,
  courses,
}: {
  kind: WaLinkKind;
  waId: number;
  title: string;
  subtitle?: string;
  date?: Date | null;
  linked: boolean;
  courses: { id: string; code: string; title: string }[];
}) {
  return (
    <ActionForm
      action={linkFor(kind, waId)}
      className="flex flex-col gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:items-center dark:border-slate-800"
    >
      <div className="flex-1">
        <p className="font-medium">
          {KIND_ICONS[kind]} {title} <span className="muted text-xs">#{waId}</span> {linked && <Pill tone="green">linked</Pill>}
        </p>
        {(subtitle || date) && (
          <p className="muted text-xs">
            {date ? <LocalTime date={date} mode="date" /> : null}
            {date && subtitle ? " · " : ""}
            {subtitle}
          </p>
        )}
      </div>
      <select name="courseId" required defaultValue="" className="sm:w-56">
        <option value="" disabled>
          Choose a course…
        </option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {c.title}
          </option>
        ))}
      </select>
      <SubmitButton className="btn-secondary" pendingText="Linking…">Link</SubmitButton>
    </ActionForm>
  );
}

/**
 * The kind and Wild Apricot id are fixed per row while the course comes from
 * that row's select, so bind the first two and read the course from form data.
 */
function linkFor(kind: WaLinkKind, waId: number) {
  return async function link(prev: Parameters<typeof linkCourseWaLink>[2], formData: FormData) {
    "use server";
    const courseId = String(formData.get("courseId") ?? "");
    if (!courseId) return { error: "Choose a course first." };
    formData.set("waId", String(waId));
    return linkCourseWaLink(courseId, kind, prev, formData);
  };
}
