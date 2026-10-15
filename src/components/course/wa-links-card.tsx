import Link from "next/link";
import type { WaLinkKind } from "@prisma/client";
import { db } from "@/lib/db";
import { waAdminEnabled } from "@/lib/wildapricot";
import { isLinkRetired, isLinkRevocable } from "@/lib/wildapricot-rules";
import { linkCourseWaLink, syncCourseWaEnrollments, toggleCourseWaLink, unlinkCourseWaLink } from "@/lib/actions/wildapricot";
import { ActionForm, LocalTime, SubmitButton } from "@/components/forms";
import { Card, Pill } from "@/components/ui";

const KINDS: { kind: WaLinkKind; label: string; icon: string; hint: string; placeholder: string }[] = [
  {
    kind: "EVENT",
    label: "Event",
    icon: "📅",
    hint: "Everyone registered for the event, paid or not. Link several if you run this course each term.",
    placeholder: "Event id, e.g. 6214703",
  },
  {
    kind: "GROUP",
    label: "Member group",
    icon: "👥",
    hint: "Everyone currently in the group. Leaving the group removes the course.",
    placeholder: "Member group id, e.g. 1284901",
  },
  {
    kind: "LEVEL",
    label: "Membership level",
    icon: "🎟️",
    hint: "Everyone whose membership is active at this level. A lapsed membership removes the course.",
    placeholder: "Membership level id, e.g. 884412",
  },
];

/**
 * Links a course to things in Wild Apricot — an event's registrants, a member
 * group, or a membership level — so the people they cover are enrolled
 * automatically. On the course Settings tab for its teacher and for admins;
 * hidden entirely when no API key is configured.
 */
export async function WaLinksCard({ courseId }: { courseId: string }) {
  if (!waAdminEnabled()) return null;
  const [links, syncedCount] = await Promise.all([
    db.courseWaLink.findMany({ where: { courseId }, orderBy: [{ kind: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }] }),
    db.enrollment.count({ where: { courseId, source: "WILD_APRICOT" } }),
  ]);

  return (
    <Card
      title="Wild Apricot"
      action={
        <Link href="/admin/wild-apricot" className="muted text-xs underline">
          Browse Wild Apricot
        </Link>
      }
    >
      <p className="muted mb-4 text-sm">
        Link an event, a member group or a membership level and the people it covers are enrolled automatically.
        {syncedCount > 0 && ` ${syncedCount} ${syncedCount === 1 ? "learner is" : "learners are"} enrolled this way right now.`}
      </p>

      {links.length > 0 && (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {links.map((l) => {
            const meta = KINDS.find((k) => k.kind === l.kind)!;
            const retired = isLinkRetired(l);
            return (
              <li key={l.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-medium">
                    {meta.icon} {l.name || `${meta.label} ${l.waId}`} <span className="muted text-xs">#{l.waId}</span>
                  </span>
                  <Pill tone="gray">{meta.label}</Pill>
                  {!l.active && <Pill tone="gray">paused</Pill>}
                  {l.active && !isLinkRevocable(l) && <Pill tone="yellow">keeps access</Pill>}
                  {l.active && isLinkRevocable(l) && <Pill tone="green">syncing</Pill>}
                </div>
                <p className="muted mt-1 text-xs">
                  {l.kind === "EVENT" && (l.startsAt ? <LocalTime date={l.startsAt} mode="date" /> : "no date")}
                  {l.lastCount !== null && `${l.kind === "EVENT" ? " · " : ""}${l.lastCount} covered`}
                  {l.lastSyncedAt && <> · synced <LocalTime date={l.lastSyncedAt} /></>}
                </p>
                {l.lastError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{l.lastError}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <form action={toggleCourseWaLink.bind(null, l.id, "active")}>
                    <button className="underline">{l.active ? "Pause syncing" : "Resume syncing"}</button>
                  </form>
                  {!retired && (
                    <form action={toggleCourseWaLink.bind(null, l.id, "revoke")}>
                      <button className="underline">
                        {l.revoke ? "Keep access when someone is no longer covered" : "Remove access when someone is no longer covered"}
                      </button>
                    </form>
                  )}
                  <form action={unlinkCourseWaLink.bind(null, l.id)}>
                    <button className="text-red-600 underline dark:text-red-400">Unlink</button>
                  </form>
                </div>
                {retired && (
                  <p className="muted mt-1 text-xs">
                    This event is over, so cancellations are no longer mirrored — enrolled learners keep their access.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
        {KINDS.map((k) => (
          <div key={k.kind}>
            <ActionForm action={linkCourseWaLink.bind(null, courseId, k.kind)} className="flex flex-col gap-2 sm:flex-row" resetOnSuccess>
              <input name="waId" required placeholder={k.placeholder} aria-label={`Wild Apricot ${k.label.toLowerCase()} id`} className="flex-1" />
              <SubmitButton className="btn-secondary whitespace-nowrap" pendingText="Checking…">
                {k.icon} Link {k.label.toLowerCase()}
              </SubmitButton>
            </ActionForm>
            <p className="muted mt-1 text-xs">{k.hint}</p>
          </div>
        ))}
        <p className="muted text-xs">
          Each id is the number at the end of the item&apos;s Wild Apricot address, or use{" "}
          <Link href="/admin/wild-apricot" className="underline">Browse Wild Apricot</Link> to pick from a list. Linking syncs straight away.
        </p>
      </div>

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
