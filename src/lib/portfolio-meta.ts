/** Client-safe labels and form settings for portfolio item types. */
export const ITEM_TYPES = {
  POSITION: {
    label: "Experience",
    singular: "Position",
    icon: "💼",
    org: "Employer / institution",
    role: null,
    dates: "range",
    currentLabel: "I currently hold this role",
    placeholderTitle: "Director of Tutoring Services",
  },
  EDUCATION: {
    label: "Education",
    singular: "Degree",
    icon: "🎓",
    org: "College / university",
    // Degrees are often written without the subject ("B.S.", "Ed.D."), so the
    // subject gets its own field rather than being buried in the title.
    role: "Field of study",
    rolePlaceholder: "e.g. Curriculum & Instruction",
    dates: "range",
    currentLabel: "I'm still studying here",
    placeholderTitle: "M.Ed.",
  },
  PRESENTATION: {
    label: "Presentations",
    singular: "Presentation",
    icon: "🎤",
    org: "Event / conference",
    role: null,
    dates: "single",
    placeholderTitle: "Building a Peer Tutoring Program That Lasts",
  },
  PUBLICATION: {
    label: "Publications",
    singular: "Publication",
    icon: "📰",
    org: "Journal / publisher",
    role: null,
    dates: "single",
    placeholderTitle: "Measuring the Impact of Supplemental Instruction",
  },
  SERVICE: {
    label: "Service & leadership",
    singular: "Service role",
    icon: "🤝",
    org: "Organization / committee",
    role: "Role",
    rolePlaceholder: "e.g. Chair, Member, Reviewer",
    dates: "range",
    currentLabel: "I currently hold this role",
    placeholderTitle: "ICLCA Conference Committee",
  },
  AWARD: {
    label: "Awards & honors",
    singular: "Award",
    icon: "🏅",
    org: "Awarded by",
    role: null,
    dates: "single",
    placeholderTitle: "Outstanding Learning Center Leader",
  },
  PROFESSIONAL_DEVELOPMENT: {
    label: "Professional development",
    singular: "Professional development",
    icon: "📚",
    org: "Provider",
    role: null,
    dates: "single",
    placeholderTitle: "CRLA Tutor Training Certification Workshop",
  },
} as const;

export type ItemType = keyof typeof ITEM_TYPES;
export const ITEM_TYPE_ORDER = Object.keys(ITEM_TYPES) as ItemType[];

export const VISIBILITY_LABELS = {
  PUBLIC: { label: "Public", description: "Anyone can view it, and search engines may list it." },
  UNLISTED: { label: "Unlisted", description: "Anyone with the link can view it; it isn't listed in search engines." },
  PRIVATE: { label: "Private", description: "Only you (and ICLCA administrators) can view it." },
} as const;

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Reads one date from the form's month and year boxes — the inverse of
 * formatMonth. The month is optional, since plenty of entries are only known
 * to the year, and a date without one is stored on 1 January with `yearOnly`
 * set so it is never read back as a genuine January.
 *
 * Returns undefined for input that can't be made sense of, including a month
 * chosen with no year: that is a half-filled form, and silently storing no
 * date at all would throw the entry away without saying so.
 */
export function parseYearMonth(monthValue: string, yearValue: string): { date: Date | null; yearOnly: boolean } | undefined {
  const year = yearValue.trim();
  const month = monthValue.trim();
  if (!year) return month ? undefined : { date: null, yearOnly: false };
  if (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 2100) return undefined;
  if (!/^(0[1-9]|1[0-2])$/.test(month) && month) return undefined;
  return { date: new Date(`${year}-${month || "01"}-01T00:00:00Z`), yearOnly: !month };
}

/** "Mar 2024", or just "2024" for a date recorded without a month. */
export function formatMonth(d: Date | string | null | undefined, yearOnly = false) {
  if (!d) return "";
  const options: Intl.DateTimeFormatOptions = yearOnly ? { year: "numeric", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat("en-US", options).format(new Date(d));
}

/**
 * "Vol. 12, No. 3" for a journal article. Either part may be missing — a
 * journal that doesn't number its issues still has volumes, and vice versa —
 * so each is labelled rather than relying on a "12(3)" shape that falls apart
 * when one side is absent.
 */
export function volumeIssue(item: { volume?: string | null; issue?: string | null }) {
  return [item.volume ? `Vol. ${item.volume}` : null, item.issue ? `No. ${item.issue}` : null].filter(Boolean).join(", ");
}

/**
 * Each end of a range carries its own precision, so "Aug 2011 – 2013" is
 * sayable: people often know when they started and only the year they
 * finished, and forcing a month on either end would invent detail.
 */
export function itemDates(
  item: { startDate: Date | string | null; endDate: Date | string | null; current: boolean; startYearOnly?: boolean; endYearOnly?: boolean },
  mode: "range" | "single",
) {
  if (mode === "single") return formatMonth(item.startDate, item.startYearOnly);
  const start = formatMonth(item.startDate, item.startYearOnly);
  const end = item.current ? "Present" : formatMonth(item.endDate, item.endYearOnly);
  return [start, end].filter(Boolean).join(" – ");
}
