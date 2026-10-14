export { clsx as cn } from "clsx";

export function formatDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined) {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(d: Date | string) {
  const seconds = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let value = -seconds;
  for (const [size, unit] of units) {
    if (Math.abs(value) < size) return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(value), unit);
    value /= size;
  }
  return "";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function letterGrade(percent: number | null) {
  if (percent === null) return "—";
  if (percent >= 93) return "A";
  if (percent >= 90) return "A-";
  if (percent >= 87) return "B+";
  if (percent >= 83) return "B";
  if (percent >= 80) return "B-";
  if (percent >= 77) return "C+";
  if (percent >= 73) return "C";
  if (percent >= 70) return "C-";
  if (percent >= 67) return "D+";
  if (percent >= 60) return "D";
  return "F";
}

/** Parses an ISO date string submitted by <DateTimeInput>, or null when empty. */
export function parseDateInput(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
