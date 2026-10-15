import Link from "next/link";
import { db } from "@/lib/db";
import { waAdminEnabled } from "@/lib/wildapricot";
import { isInRevokeWindow } from "@/lib/wildapricot-rules";
import { linkCourseWaEvent, syncCourseWaEnrollments, toggleCourseWaEvent, unlinkCourseWaEvent } from "@/lib/actions/wildapricot";
import { ActionForm, LocalTime, SubmitButton } from "@/components/forms";
import { Card, Pill } from "@/components/ui";

/**
 * Links a course to Wild Apricot events, so anyone registered for one of them is
 * enrolled automatically. Rendered on the course Settings tab for its teacher
 * and for admins; hidden entirely when no API key is configured.
 */
export async function WaEventsCard({ courseId }: { courseId: string }) {
  if (!waAdminEnabled()) return null;
  const links = await db.courseWaEvent.findMany({
    where: { courseId },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
  });
  const syncedCount = await db.enrollment.count({ where: { courseId, source: "WILD_APRICOT" } });

  return (
    <Card
      title="Wild Apricot registrations"
      action={
        <Link href="/admin/wild-apricot" className="muted text-xs underline">
          Browse events
        </Link>
      }
    >
      <p className="muted mb-4 text-sm">
        Anyone registered for a linked event is enrolled in this course, whether or not they&apos;ve paid.
        Link several events if you run this course more than once.
        {syncedCount > 0 && ` ${syncedCount} ${syncedCount === 1 ? "learner is" : "learners are"} enrolled this way right now.`}
      </p>

      {links.length > 0 && (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {links.map((l) => {
            const past = !isInRevokeWindow(l.endsAt);
            return (
              <li key={l.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-medium">
                    {l.name || `Event ${l.waEventId}`} <span className="muted text-xs">#{l.waEventId}</span>
                  </span>
                  {!l.active && <Pill tone="gray">paused</Pill>}
                  {l.active && !l.revoke && <Pill tone="yellow">keeps access</Pill>}
                  {l.active && l.revoke && <Pill tone="green">syncing</Pill>}
                </div>
                <p className="muted mt-1 text-xs">
                  {l.startsAt ? <LocalTime date={l.startsAt} mode="date" /> : "no date"}
                  {l.lastCount !== null && ` · ${l.lastCount} registered`}
                  {l.lastSyncedAt && <> · synced <LocalTime date={l.lastSyncedAt} /></>}
                </p>
                {l.lastError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{l.lastError}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <form action={toggleCourseWaEvent.bind(null, l.id, "active")}>
                    <button className="underline">{l.active ? "Pause syncing" : "Resume syncing"}</button>
                  </form>
                  {!past && (
                    <form action={toggleCourseWaEvent.bind(null, l.id, "revoke")}>
                      <button className="underline">
                        {l.revoke ? "Keep access if a registration is cancelled" : "Remove access if a registration is cancelled"}
                      </button>
                    </form>
                  )}
                  <form action={unlinkCourseWaEvent.bind(null, l.id)}>
                    <button className="text-red-600 underline dark:text-red-400">Unlink</button>
                  </form>
                </div>
                {past && (
                  <p className="muted mt-1 text-xs">
                    This event is over, so cancellations are no longer mirrored — enrolled learners keep their access.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ActionForm action={linkCourseWaEvent.bind(null, courseId)} className="flex flex-col gap-2 sm:flex-row" resetOnSuccess>
        <input
          name="waEventId"
          required
          placeholder="Wild Apricot event id, e.g. 6214703"
          aria-label="Wild Apricot event id"
          className="flex-1"
        />
        <SubmitButton className="btn-secondary" pendingText="Checking…">Link event</SubmitButton>
      </ActionForm>
      <p className="muted mt-2 text-xs">
        The id is the number at the end of the event&apos;s Wild Apricot address. Linking runs the sync straight away.
      </p>

      {links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <ActionForm action={syncCourseWaEnrollments.bind(null, courseId)}>
            <input type="hidden" name="dryRun" value="1" />
            <SubmitButton className="btn-secondary text-xs" pendingText="Checking…">Preview</SubmitButton>
          </ActionForm>
          <ActionForm action={syncCourseWaEnrollments.bind(null, courseId)}>
            <SubmitButton className="btn-secondary text-xs" pendingText="Syncing…">Sync this course now</SubmitButton>
          </ActionForm>
        </div>
      )}
    </Card>
  );
}
