"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isHex } from "@/lib/color";
import { isSafeUrl } from "@/lib/blocks";
import { DEFAULT_BRANDING } from "@/lib/branding-defaults";
import type { ActionResult } from "@/lib/action-types";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

function imageUrl(value: string, label: string): string | null | { error: string } {
  if (!value) return null;
  if (!isSafeUrl(value)) return { error: `${label} must be a web address (https://…).` };
  return value;
}

function refresh() {
  revalidateTag("branding");
  revalidatePath("/", "layout");
}

export async function saveBranding(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const siteName = str(formData.get("siteName")).slice(0, 60);
  const shortName = str(formData.get("shortName")).slice(0, 20);
  const orgName = str(formData.get("orgName")).slice(0, 120);
  const tagline = str(formData.get("tagline")).slice(0, 120);
  const loginMessage = str(formData.get("loginMessage")).slice(0, 2000);
  const primaryColor = str(formData.get("primaryColor")).toLowerCase();
  const accentColor = str(formData.get("accentColor")).toLowerCase();
  if (!siteName || !shortName || !orgName) return { error: "Site name, short name and organization name are required." };
  if (!isHex(primaryColor) || !isHex(accentColor)) return { error: "Colors must be 6-digit hex values like #2547ea." };
  const logoUrl = imageUrl(str(formData.get("logoUrl")), "Logo");
  const faviconUrl = imageUrl(str(formData.get("faviconUrl")), "Browser icon");
  if (logoUrl && typeof logoUrl === "object") return logoUrl;
  if (faviconUrl && typeof faviconUrl === "object") return faviconUrl;

  const data = { siteName, shortName, orgName, tagline, loginMessage, primaryColor, accentColor, logoUrl, faviconUrl, updatedById: admin.id };
  await db.siteSettings.upsert({ where: { id: "site" }, update: data, create: { id: "site", ...data } });
  refresh();
  return { ok: "Branding saved. Reload any open pages to see the changes everywhere." };
}

export async function resetBranding() {
  const admin = await requireRole("ADMIN");
  const data = { ...DEFAULT_BRANDING, updatedById: admin.id };
  await db.siteSettings.upsert({ where: { id: "site" }, update: data, create: { id: "site", ...data } });
  refresh();
}
