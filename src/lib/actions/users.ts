"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role, Theme } from "@prisma/client";
import { db } from "@/lib/db";
import { checkPassword, hashPassword, requireRole, requireUser } from "@/lib/auth";
import { isSafeUrl } from "@/lib/blocks";
import type { ActionResult } from "@/lib/action-types";

const ROLES: Role[] = ["ADMIN", "TEACHER", "STUDENT"];
const THEMES: Theme[] = ["SYSTEM", "LIGHT", "DARK"];

export async function updateProfile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 1000) || null;
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim() || null;
  const institution = String(formData.get("institution") ?? "").trim().slice(0, 200) || null;
  const jobTitle = String(formData.get("jobTitle") ?? "").trim().slice(0, 200) || null;
  if (name.length < 2) return { error: "Please enter your name." };
  if (avatarUrl && !isSafeUrl(avatarUrl)) return { error: "Avatar must be an http(s) image URL." };
  await db.user.update({ where: { id: user.id }, data: { name, bio, avatarUrl, institution, jobTitle } });
  revalidatePath("/", "layout");
  return { ok: "Profile updated." };
}

export async function updatePreferences(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const theme = String(formData.get("theme")) as Theme;
  if (!THEMES.includes(theme)) return { error: "Invalid theme." };
  await db.user.update({
    where: { id: user.id },
    data: {
      theme,
      showOnLeaderboard: formData.get("showOnLeaderboard") === "on",
    },
  });
  revalidatePath("/", "layout");
  return { ok: "Preferences saved." };
}

export async function changePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const sessionUser = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!(await checkPassword(current, user.passwordHash))) return { error: "Current password is incorrect." };
  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  return { ok: "Password changed." };
}

// ─── Admin ───────────────────────────────────────────────────────────────────

const newUserSchema = z.object({
  name: z.string().trim().min(2, "Name is required."),
  email: z.email("Valid email required.").transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Temporary password must be at least 8 characters."),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"]),
});

export async function adminCreateUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const parsed = newUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password, role } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) return { error: "A user with that email already exists." };
  const user = await db.user.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
  await db.certification.updateMany({ where: { holderEmail: email, holderId: null }, data: { holderId: user.id } });
  revalidatePath("/admin");
  return { ok: `Created ${name} (${role.toLowerCase()}).` };
}

/** Bulk import: one user per line — "Name, email, role" (role optional, defaults to student). */
export async function adminImportUsers(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Temporary password must be at least 8 characters." };
  const hash = await hashPassword(password);
  const lines = String(formData.get("csv") ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let created = 0;
  const skipped: string[] = [];
  for (const line of lines) {
    const [name, email, roleRaw] = line.split(",").map((s) => s?.trim());
    const role = (roleRaw?.toUpperCase() || "STUDENT") as Role;
    const parsed = newUserSchema.safeParse({ name, email, password, role });
    if (!parsed.success || (await db.user.findUnique({ where: { email: parsed.data.email } }))) {
      skipped.push(email || line);
      continue;
    }
    await db.user.create({ data: { name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, passwordHash: hash } });
    created++;
  }
  revalidatePath("/admin");
  return skipped.length ? { error: `Created ${created}. Skipped (invalid or existing): ${skipped.join(", ")}` } : { ok: `Created ${created} users.` };
}

export async function adminSetRole(userId: string, formData: FormData) {
  const admin = await requireRole("ADMIN");
  const role = String(formData.get("role")) as Role;
  if (!ROLES.includes(role) || userId === admin.id) return;
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin");
}

export async function adminToggleActive(userId: string) {
  const admin = await requireRole("ADMIN");
  if (userId === admin.id) return;
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { active: !u.active } });
  revalidatePath("/admin");
}

export async function adminResetPassword(userId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "At least 8 characters." };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  return { ok: "Password reset." };
}
