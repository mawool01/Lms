"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";

export function CourseTabs({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const pathname = usePathname();
  const base = `/courses/${courseId}`;
  const items = [
    { key: "overview", label: "Overview", href: base },
    { key: "quizzes", label: "Quizzes", href: `${base}/quizzes` },
    { key: "assignments", label: "Assignments", href: `${base}/assignments` },
    { key: "forum", label: "Forum", href: `${base}/forum` },
    { key: "live", label: "Live class", href: `${base}/live` },
    { key: "grades", label: canManage ? "Gradebook" : "Grades", href: `${base}/grades` },
    { key: "leaderboard", label: "Leaderboard", href: `${base}/leaderboard` },
    ...(canManage
      ? [
          { key: "analytics", label: "Analytics", href: `${base}/analytics` },
          { key: "people", label: "People", href: `${base}/people` },
          { key: "settings", label: "Settings", href: `${base}/settings` },
        ]
      : [{ key: "people", label: "People", href: `${base}/people` }]),
  ];
  const segment = pathname.slice(base.length).split("/")[1] ?? "";
  const active = segment === "" || segment === "lessons" || segment === "scorm" ? "overview" : segment;
  return <Tabs items={items} active={active} />;
}
