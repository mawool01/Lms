/** Client-safe branding defaults and presets. */
export type Branding = {
  siteName: string;
  shortName: string;
  orgName: string;
  tagline: string;
  loginMessage: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
};

export const DEFAULT_BRANDING: Branding = {
  siteName: "ICLCA Learning",
  shortName: "ICLCA",
  orgName: "International College Learning Center Association",
  tagline: "Learn, teach and grow together",
  loginMessage: "",
  primaryColor: "#2547ea",
  accentColor: "#c8992e",
  logoUrl: null,
  faviconUrl: null,
};

export const PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: "ICLCA Blue", primary: "#2547ea", accent: "#c8992e" },
  { name: "Teal", primary: "#0f766e", accent: "#f59e0b" },
  { name: "Maroon", primary: "#7a1f2b", accent: "#c8992e" },
  { name: "Forest", primary: "#166534", accent: "#ca8a04" },
  { name: "Purple", primary: "#6d28d9", accent: "#db2777" },
  { name: "Slate", primary: "#334155", accent: "#0ea5e9" },
];
