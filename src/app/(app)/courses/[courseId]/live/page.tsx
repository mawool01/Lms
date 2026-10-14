import { requireUser } from "@/lib/auth";
import { requireCourseMember } from "@/lib/permissions";
import { jitsiRoomUrl, meetingProvider } from "@/lib/video";
import { Card } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Live class" };

export default async function LivePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  const { course, canManage } = await requireCourseMember(user, courseId);
  const room = jitsiRoomUrl("course", course.id);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card title="🎥 Scheduled live class">
        {course.meetingUrl ? (
          <>
            <p className="muted mb-4 text-sm">Your instructor hosts live sessions on {meetingProvider(course.meetingUrl)}.</p>
            <a href={course.meetingUrl} target="_blank" rel="noopener noreferrer" className="btn-primary w-full py-3 text-base">
              Join {meetingProvider(course.meetingUrl)} class
            </a>
          </>
        ) : (
          <p className="muted text-sm">
            No meeting link has been set for this course yet.
            {canManage && <> Add your Zoom, Google Meet or Teams link in <Link href={`/courses/${courseId}/settings`} className="link">course settings</Link>.</>}
          </p>
        )}
      </Card>
      <Card title="⚡ Instant classroom">
        <p className="muted mb-4 text-sm">
          A free video room just for this course — great for office hours and study groups. No account or download needed; works on phones too.
        </p>
        <a href={room} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full py-3 text-base">Open course video room</a>
        <p className="muted mt-3 text-xs break-all">{room}</p>
      </Card>
    </div>
  );
}
