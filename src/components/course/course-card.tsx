import Link from "next/link";
import type { ReactNode } from "react";
import { Pill, ProgressBar } from "@/components/ui";

const GRADIENTS = [
  "from-brand-500 to-indigo-700",
  "from-emerald-500 to-teal-700",
  "from-amber-500 to-orange-700",
  "from-pink-500 to-rose-700",
  "from-sky-500 to-cyan-700",
  "from-violet-500 to-purple-700",
];

export function courseGradient(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function CourseCover({ id, code, coverUrl, className = "h-28" }: { id: string; code: string; coverUrl: string | null; className?: string }) {
  if (coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={coverUrl} alt="" className={`${className} w-full object-cover`} />;
  }
  return (
    <div className={`${className} flex w-full items-end bg-gradient-to-br p-4 ${courseGradient(id)}`}>
      <span className="text-lg font-bold text-white/90">{code}</span>
    </div>
  );
}

export function CourseCard({
  course,
  progress,
  footer,
}: {
  course: { id: string; title: string; code: string; coverUrl: string | null; category: string; published: boolean; teacher: { name: string } };
  progress?: number;
  footer?: ReactNode;
}) {
  return (
    <div className="card flex flex-col overflow-hidden transition hover:shadow-md">
      <Link href={`/courses/${course.id}`}>
        <CourseCover id={course.id} code={course.code} coverUrl={course.coverUrl} />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Pill>{course.category}</Pill>
          {!course.published && <Pill tone="yellow">Draft</Pill>}
        </div>
        <Link href={`/courses/${course.id}`} className="font-semibold hover:underline">{course.title}</Link>
        <p className="muted text-sm">{course.teacher.name}</p>
        {progress !== undefined && (
          <div className="mt-auto pt-2">
            <div className="muted mb-1 flex justify-between text-xs"><span>Progress</span><span>{progress}%</span></div>
            <ProgressBar value={progress} tone={progress === 100 ? "green" : "brand"} />
          </div>
        )}
        {footer && <div className="mt-auto pt-2">{footer}</div>}
      </div>
    </div>
  );
}
