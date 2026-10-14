"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { parseChartData } from "@/lib/blocks";

const OTHER_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9", "#ec4899"];
export const CHART_COLORS = ["#2547ea", ...OTHER_COLORS];

/** Chart palette whose first color is the admin-chosen brand color (read from the CSS variable at runtime). */
export function useChartColors() {
  const [colors, setColors] = useState(CHART_COLORS);
  useEffect(() => {
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--color-brand-600").trim();
    if (brand) setColors([brand, ...OTHER_COLORS]);
  }, []);
  return colors;
}

export function ChartBlock({ chartType, data, title }: { chartType: "bar" | "line" | "pie" | "area"; data: string; title?: string }) {
  const CHART_COLORS = useChartColors();
  const { rows, series, labelKey } = parseChartData(data);
  if (!rows.length || !series.length) return <p className="muted text-sm italic">Chart has no data yet.</p>;

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} />
      <XAxis dataKey={labelKey} tick={{ fontSize: 12, fill: "currentColor" }} />
      <YAxis tick={{ fontSize: 12, fill: "currentColor" }} />
      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
      {series.length > 1 && <Legend />}
    </>
  );

  return (
    <figure className="my-4">
      {title && <figcaption className="mb-2 text-center text-sm font-semibold">{title}</figcaption>}
      <div className="h-72 w-full text-slate-500">
        <ResponsiveContainer>
          {chartType === "pie" ? (
            <PieChart>
              <Pie data={rows} dataKey={series[0]} nameKey={labelKey} outerRadius="80%" label>
                {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : chartType === "line" ? (
            <LineChart data={rows}>
              {axes}
              {series.map((s, i) => <Line key={s} type="monotone" dataKey={s} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} />)}
            </LineChart>
          ) : chartType === "area" ? (
            <AreaChart data={rows}>
              {axes}
              {series.map((s, i) => (
                <Area key={s} type="monotone" dataKey={s} stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.2} />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={rows}>
              {axes}
              {series.map((s, i) => <Bar key={s} dataKey={s} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />)}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
