"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartColors } from "@/components/lesson/chart-block";

const tick = { fontSize: 11, fill: "currentColor" };
const tooltipStyle = { borderRadius: 8, fontSize: 12, color: "#0f172a" };

/** Re-fetches server data periodically so analytics stay live. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

export function ActivityChart({ data }: { data: { day: string; Lessons: number; Quizzes: number; Assignments: number; Forum: number }[] }) {
  const CHART_COLORS = useChartColors();
  return (
    <div className="h-64 text-slate-500">
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
          <XAxis dataKey="day" tick={tick} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={tick} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          {(["Lessons", "Quizzes", "Assignments", "Forum"] as const).map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PercentBarChart({ data, passMarkKey }: { data: { name: string; value: number; passMark?: number }[]; passMarkKey?: boolean }) {
  const CHART_COLORS = useChartColors();
  return (
    <div className="h-64 text-slate-500">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
          <XAxis dataKey="name" tick={tick} interval={0} angle={data.length > 5 ? -25 : 0} textAnchor={data.length > 5 ? "end" : "middle"} height={data.length > 5 ? 60 : 30} />
          <YAxis domain={[0, 100]} tick={tick} unit="%" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
          {passMarkKey && data[0]?.passMark !== undefined && <ReferenceLine y={data[0].passMark} stroke="#ef4444" strokeDasharray="4 4" />}
          <Bar dataKey="value" name="Percent" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.passMark !== undefined && d.value < d.passMark ? "#ef4444" : CHART_COLORS[0]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistributionChart({ data }: { data: { name: string; count: number }[] }) {
  const colors = ["#10b981", "#22c55e", "#f59e0b", "#f97316", "#ef4444", "#94a3b8"];
  return (
    <div className="h-64 text-slate-500">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
          <XAxis dataKey="name" tick={tick} />
          <YAxis allowDecimals={false} tick={tick} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
