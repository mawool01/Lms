import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { WaError, waAdminEnabled, waConfig, waEnabled } from "@/lib/wildapricot";
import { type WaEventSummary, waListEvents } from "@/lib/wildapricot-admin";
import { linkCourseWaEvent, syncAllWaEnrollments } from "@/lib/actions/wildapricot";
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

export default async function AdminWildApricotPage({ searchParams }: { searchParams: Promise<{ q?: string; upcoming?: string }> }) {
  await requireRole("ADMIN");
  const { q = "", upcoming = "1" } = await searchParams;
  const configured = waAdminEnabled();

  const [links, lastRun, courses] = await Promise.all([
    db.courseWaEvent.findMany({
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      include: { course: { select: { id: true, code: true, title: true } } },
    }),
    db.waSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    db.course.findMany({ orderBy: { title: "asc" }, select: { id: true, code: true, title: true } }),
  ]);

  // Only hit the Wild Apricot API when a search was actually asked for.
  let events: WaEventSummary[] | null = null;
  let eventsError: string | null = null;
  if (configured && (q || upcoming === "1")) {
    try {
      events = await waListEvents({ q, from: upcoming === "1" ? new Date() : undefined });
    } catch (e) {
      eventsError = e instanceof WaError ? e.message : "Couldn't load events from Wild Apricot.";
    }
  }

  const detail = (lastRun?.detail ?? {}) as RunDetail;
  const linkedIds = new Set(links.map((l) => l.waEventId));

  return (
    <>
      <PageHeader
        title="Wild Apricot"
        subtitle="Turn event registrations into course enrollments."
        actions={<Link href="/admin" className="btn-secondary">← Administration</Link>}
      />

      {!configured && (
        <Card className="mb-6">
          <p className="font-medium">Registration sync isn&apos;t set up yet.</p>
          <p className="muted mt-2 text-sm">
            In Wild Apricot go to <strong>Settings → Integration → API keys</strong>, authorize a{" "}
            <strong>server application</strong> with access to events and contacts, then set{" "}
            <code>WILDAPRICOT_API_KEY</code> in this project&apos;s environment variables and redeploy.
            {!waEnabled() && " Sign-on isn't configured either (WILDAPRICOT_URL / CLIENT_ID / CLIENT_SECRET)."}
          </p>
        </Card>
      )}

      {configured && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Linked events" value={links.length} hint={`${links.filter((l) => l.active).length} active`} />
            <Stat label="Registrations" value={lastRun?.registrations ?? 0} hint="last sync" />
            <Stat label="Enrolled" value={lastRun?.enrolled ?? 0} hint="last sync" />
            <Stat label="Removed" value={lastRun?.revoked ?? 0} hint="last sync" />
            <Stat label="No LMS account" value={lastRun?.unmatched ?? 0} hint="last sync" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card
              title="Last sync"
              className="lg:col-span-2"
              action={lastRun ? <span className="muted text-xs"><LocalTime date={lastRun.startedAt} /> · {lastRun.trigger.toLowerCase().replace("_", " ")}</span> : undefined}
            >
              {!lastRun ? (
                <p className="muted text-sm">The sync hasn&apos;t run yet. It runs nightly, or use the buttons opposite.</p>
              ) : (
                <>
                  <p className="text-sm">
                    {lastRun.summary} {lastRun.dryRun && <Pill tone="gray">preview only</Pill>} {!lastRun.ok && <Pill tone="red">had problems</Pill>}
                  </p>
                  {detail.skippedRevocation?.length ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                      <p className="font-medium">Removals were held back</p>
                      <ul className="muted mt-1 space-y-1 text-xs">
                        {detail.skippedRevocation.map((s, i) => <li key={i}>{s.courseCode}: {s.reason}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {detail.errors?.length ? (
                    <ul className="mt-3 space-y-1 text-xs text-red-600 dark:text-red-400">
                      {detail.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  ) : null}
                  {detail.enrolled?.length ? (
                    <>
                      <h3 className="mt-4 mb-1 text-sm font-semibold">Enrolled</h3>
                      <ul className="muted space-y-1 text-xs">
                        {detail.enrolled.slice(0, 25).map((c, i) => (
                          <li key={i}>
                            {c.userName} → {c.courseCode} <span className="opacity-60">(event {c.waEventId}{c.matchedBy === "email" ? ", matched by email" : ""})</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {detail.revoked?.length ? (
                    <>
                      <h3 className="mt-4 mb-1 text-sm font-semibold">Access removed</h3>
                      <ul className="muted space-y-1 text-xs">
                        {detail.revoked.slice(0, 25).map((c, i) => <li key={i}>{c.userName} ✕ {c.courseCode}</li>)}
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
                <div className="flex justify-between"><dt>Account</dt><dd>{waConfig().accountId || "from API key"}</dd></div>
                <div className="flex justify-between">
                  <dt>Match by email</dt>
                  <dd>{process.env.WILDAPRICOT_SYNC_EMAIL_MATCH !== "false" ? "on" : "off"}</dd>
                </div>
                <div className="flex justify-between"><dt>Nightly job</dt><dd>{process.env.CRON_SECRET ? "enabled" : "needs CRON_SECRET"}</dd></div>
              </dl>
            </Card>
          </div>

          {detail.unmatched?.length ? (
            <Card
              className="mt-6"
              title="Registered in Wild Apricot, but no LMS account"
              action={<span className="muted text-xs">{lastRun?.unmatched} at the last sync</span>}
            >
              <p className="muted mb-3 text-sm">
                These people are registered but couldn&apos;t be matched to an account. Create accounts for them in{" "}
                <Link href="/admin" className="underline">Administration</Link> (bulk import takes{" "}
                <code>name, email</code> per line) and the next sync will enroll them.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="muted text-left text-xs uppercase">
                    <tr><th className="py-1 pr-3">Name</th><th className="py-1 pr-3">Email</th><th className="py-1 pr-3">Course</th><th className="py-1">Why</th></tr>
                  </thead>
                  <tbody>
                    {detail.unmatched.map((u, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-3">{u.name}</td>
                        <td className="py-1.5 pr-3">{u.email ?? <span className="muted">—</span>}</td>
                        <td className="py-1.5 pr-3">{u.courseCode}</td>
                        <td className="muted py-1.5 text-xs">
                          {u.reason === "no-contact-id" ? "registration has no Wild Apricot contact" : "no LMS account with that email"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted mt-3 text-xs">
                Copy these addresses: {detail.unmatched.map((u) => u.email).filter(Boolean).join(", ") || "none have an email address"}
              </p>
            </Card>
          ) : null}

          <Card className="mt-6" title="Linked events" action={<span className="muted text-xs">Manage each one on its course&apos;s Settings tab</span>}>
            {!links.length ? (
              <EmptyState icon="🌿" title="No events linked yet">
                Find an event below, choose a course and link it — or do it from a course&apos;s Settings tab.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="muted text-left text-xs uppercase">
                    <tr><th className="py-1 pr-3">Event</th><th className="py-1 pr-3">Course</th><th className="py-1 pr-3">Registrations</th><th className="py-1 pr-3">Last synced</th><th className="py-1">State</th></tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-3">
                          {l.name || `Event ${l.waEventId}`} <span className="muted text-xs">#{l.waEventId}</span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <Link href={`/courses/${l.courseId}/settings`} className="underline">{l.course.code}</Link>
                        </td>
                        <td className="py-1.5 pr-3">{l.lastCount ?? <span className="muted">—</span>}</td>
                        <td className="muted py-1.5 pr-3 text-xs">{l.lastSyncedAt ? <LocalTime date={l.lastSyncedAt} /> : "never"}</td>
                        <td className="py-1.5">
                          {!l.active && <Pill tone="gray">paused</Pill>}
                          {l.active && !l.revoke && <Pill tone="yellow">keeps access</Pill>}
                          {l.active && l.revoke && <Pill tone="green">syncing</Pill>}
                          {l.lastError && <span className="ml-1 text-xs text-red-600 dark:text-red-400">{l.lastError}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="mt-6" title="Find a Wild Apricot event">
            <form className="mb-4 flex flex-col gap-2 sm:flex-row">
              <input name="q" defaultValue={q} placeholder="Search event names" />
              <label className="flex items-center gap-2 text-sm font-normal whitespace-nowrap">
                <input type="checkbox" name="upcoming" value="1" defaultChecked={upcoming === "1"} /> Current &amp; upcoming only
              </label>
              <SubmitButton className="btn-secondary">Search</SubmitButton>
            </form>
            {eventsError && <p className="text-sm text-red-600 dark:text-red-400">{eventsError}</p>}
            {!eventsError && events && !events.length && <p className="muted text-sm">No events matched.</p>}
            {!eventsError && events?.length ? (
              <div className="space-y-2">
                {events.slice(0, 40).map((e) => (
                  <ActionForm
                    key={e.id}
                    action={linkCourseWaEventFor(e.id)}
                    className="flex flex-col gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:items-center dark:border-slate-800"
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {e.name} <span className="muted text-xs">#{e.id}</span> {linkedIds.has(e.id) && <Pill tone="green">linked</Pill>}
                      </p>
                      <p className="muted text-xs">
                        {e.startDate ? <LocalTime date={e.startDate} mode="date" /> : "no date"}
                        {e.location ? ` · ${e.location}` : ""}
                        {e.registrationsLimit ? ` · limit ${e.registrationsLimit}` : ""}
                      </p>
                    </div>
                    <select name="courseId" required defaultValue="" className="sm:w-56">
                      <option value="" disabled>Choose a course…</option>
                      {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
                    </select>
                    <SubmitButton className="btn-secondary" pendingText="Linking…">Link</SubmitButton>
                  </ActionForm>
                ))}
              </div>
            ) : null}
          </Card>
        </>
      )}
    </>
  );
}

/**
 * The event id is fixed per row and the course comes from the row's select, so
 * bind the event and read the course out of the form data.
 */
function linkCourseWaEventFor(waEventId: number) {
  return async function link(prev: Parameters<typeof linkCourseWaEvent>[1], formData: FormData) {
    "use server";
    const courseId = String(formData.get("courseId") ?? "");
    if (!courseId) return { error: "Choose a course first." };
    formData.set("waEventId", String(waEventId));
    return linkCourseWaEvent(courseId, prev, formData);
  };
}
