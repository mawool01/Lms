"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkPassword, endSession, hashPassword, startSession } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-types";

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await checkPassword(password, user.passwordHash))) return { error: "Invalid email or password." };
  if (!user.active) return { error: "This account has been deactivated. Contact an administrator." };
  await startSession(user.id);
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name."),
  email: z.email("Please enter a valid email.").transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function signupAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (process.env.ALLOW_SIGNUP === "false") return { error: "Self sign-up is disabled. Ask an administrator for an account." };
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with that email already exists." };
  // The very first account becomes the administrator.
  const isFirst = (await db.user.count()) === 0;
  const user = await db.user.create({
    data: { name, email, passwordHash: await hashPassword(password), role: isFirst ? "ADMIN" : "STUDENT" },
  });
  await startSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
