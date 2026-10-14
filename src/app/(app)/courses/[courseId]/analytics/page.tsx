import { requireUser } from "@/lib/auth";
import { requireCourseManager } from "@/lib/permissions";
import { courseAnalytics } from "@/lib/analytics";
import { letterGrade, timeAgo } from "@/lib/utils";
import { ActivityChart, AutoRefresh, DistributionChart, PercentBarChart } from "@/components/analytics/charts";
import { Avatar, Card, EmptyState, Pill, ProgressBar, Stat } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Course analytics" };

export default async function AnalyticsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  await requireCourseManager(user, courseId);
  const a = await courseAnalytics(courseId);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <p className="muted flex items-center gap-2 text-xs">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
        Live — updates every 30 seconds
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Students" value={a.kpis.students} icon="👥" />
        <Stat label="Avg progress" value={`${a.kpis.avgProgress}%`} icon="📈" />
        <Stat label="Avg grade" value={a.kpis.avgGrade !== null ? `${a.kpis.avgGrade}%` : "—"} hint={letterGrade(a.kpis.avgGrade)} icon="🎯" />
        <Stat label="Active this week" value={a.kpis.activeWeek} hint={a.kpis.students ? `${Math.round((a.kpis.activeWeek / a.kpis.students) * 100)}% of class` : undefined} icon="⚡" />
        <Stat label="Need attention" value={a.kpis.atRisk} icon="🚩" />
      </div>

      <Card title="Activity — last 30 days">
        <ActivityChart data={a.activity} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Assessment performance" action={<span className="muted text-xs">Quizzes & SCORM · average grade · red = below pass mark</span>}>
          {a.quizPerformance.length ? <PercentBarChart data={a.quizPerformance} passMarkKey /> : <EmptyState icon="📝" title="No published quizzes or SCORM packages" />}
        </Card>
        <Card title="Grade distribution">
          <DistributionChart data={a.distribution} />
        </Card>
      </div>

      <Card title="Content completion" action={<span className="muted text-xs">% of class that completed each lesson / SCORM package</span>}>
        {a.lessonCompletion.length ? <PercentBarChart data={a.lessonCompletion} /> : <EmptyState icon="📘" title="No lessons yet" />}
      </Card>

      <Card title="Students needing attention first">
        {a.students.length === 0 ? (
          <EmptyState icon="👥" title="No students enrolled" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Student</th><th>Progress</th><th>Grade</th><th>Last active</th><th>Flags</th></tr></thead>
              <tbody>
                {a.students.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/users/${s.id}`} className="flex items-center gap-2 hover:underline"><Avatar name={s.name} url={s.avatarUrl} size={24} />{s.name}</Link></td>
                    <td className="w-36"><div className="flex items-center gap-2"><ProgressBar value={s.progress} /><span className="text-xs">{s.progress}%</span></div></td>
                    <td className="font-medium">{s.grade !== null ? `${s.grade}% (${letterGrade(s.grade)})` : "—"}</td>
                    <td className="muted whitespace-nowrap">{s.lastActive ? timeAgo(s.lastActive) : "Never"}</td>
                    <td><div className="flex flex-wrap gap-1">{s.flags.length ? s.flags.map((f) => <Pill key={f} tone="red">{f}</Pill>) : <Pill tone="green">On track</Pill>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
