"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type PortfolioItemType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { isSafeUrl } from "@/lib/blocks";
import { appUrl, sendEmail } from "@/lib/certifications/email";
import { ITEM_TYPES } from "@/lib/portfolio-meta";
import { slugProblem } from "@/lib/portfolio";
import { orderUpdates } from "@/lib/reorder";
import type { ActionResult } from "@/lib/action-types";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const optional = (v: FormDataEntryValue | null, max = 300) => str(v).slice(0, max) || null;
const MAX_FILES = 10;

function revalidatePortfolio(slug?: string | null) {
  revalidatePath("/portfolio");
  if (slug) revalidatePath(`/p/${slug}`);
}

export async function savePortfolioSettings(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const slug = str(formData.get("slug")).toLowerCase();
  const problem = slugProblem(slug);
  if (problem) return { error: problem };
  const visibility = str(formData.get("visibility"));
  if (!["PUBLIC", "UNLISTED", "PRIVATE"].includes(visibility)) return { error: "Choose who can see your portfolio." };
  try {
    await db.user.update({
      where: { id: user.id },
      data: {
        portfolioSlug: slug,
        portfolioVisibility: visibility as "PUBLIC",
        portfolioHeadline: optional(formData.get("headline"), 160),
        portfolioSummary: optional(formData.get("summary"), 5000),
        portfolioShowCertifications: formData.get("showCertifications") === "on",
        portfolioShowCourses: formData.get("showCourses") === "on",
        portfolioShowBadges: formData.get("showBadges") === "on",
        portfolioShowPoints: formData.get("showPoints") === "on",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That address is already taken. Please choose another." };
    throw e;
  }
  revalidatePortfolio(user.portfolioSlug);
  revalidatePortfolio(slug);
  return { ok: "Portfolio settings saved." };
}

/** Accepts only files this person uploaded to their portfolio folder (Blob URL or /files/ path). */
function isOwnPortfolioFile(url: string, userId: string) {
  if (!isSafeUrl(url)) return false;
  const { hostname, pathname } = new URL(url);
  const path = decodeURIComponent(pathname);
  if (hostname.endsWith(".blob.vercel-storage.com")) return path.startsWith(`/portfolio/${userId}/`);
  return path.startsWith(`/files/portfolio/${userId}/`);
}

function parseMonth(value: string) {
  if (!value) return null;
  const d = new Date(/^\d{4}-\d{2}$/.test(value) ? `${value}-01T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function savePortfolioItem(itemId: string | null, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const type = str(formData.get("type")) as PortfolioItemType;
  if (!(type in ITEM_TYPES)) return { error: "Unknown item type." };
  const title = str(formData.get("title")).slice(0, 300);
  if (!title) return { error: "Title is required." };
  const url = optional(formData.get("url"), 1000);
  if (url && !isSafeUrl(url)) return { error: "Links must start with http:// or https://" };
  const files = [...new Set(formData.getAll("files").map((f) => String(f).trim()).filter(Boolean))];
  if (files.length > MAX_FILES) return { error: `You can attach up to ${MAX_FILES} files.` };
  if (files.some((f) => !isOwnPortfolioFile(f, user.id))) return { error: "One of the attached files couldn't be verified. Please upload it again." };
  const startDate = parseMonth(str(formData.get("startDate")));
  const endDate = parseMonth(str(formData.get("endDate")));
  if (startDate === undefined || endDate === undefined) return { error: "Dates are invalid." };
  const current = formData.get("current") === "on";
  if (startDate && endDate && !current && endDate < startDate) return { error: "The end date is before the start date." };
  const hoursRaw = str(formData.get("hours"));
  const hours = hoursRaw ? Number(hoursRaw) : null;
  if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 10000)) return { error: "Hours must be a number between 0 and 10,000." };

  const data = {
    type,
    title,
    organization: optional(formData.get("organization")),
    role: optional(formData.get("role")),
    location: optional(formData.get("location")),
    startDate,
    endDate: current ? null : endDate,
    current,
    description: str(formData.get("description")).slice(0, 10000),
    url,
    files,
    hours,
    collaborators: optional(formData.get("collaborators"), 500),
  };

  if (itemId) {
    const existing = await db.portfolioItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.userId !== user.id) return { error: "Item not found." };
    // Changing a verified or pending item means ICLCA has to look at it again.
    const changed = (Object.keys(data) as (keyof typeof data)[]).some((k) => JSON.stringify(data[k]) !== JSON.stringify(existing[k]));
    await db.portfolioItem.update({
      where: { id: itemId },
      data: { ...data, ...(changed && existing.verification !== "NONE" ? { verification: "NONE", verifiedAt: null, verifiedById: null, verificationNote: null } : {}) },
    });
  } else {
    const position = await db.portfolioItem.count({ where: { userId: user.id, type } });
    await db.portfolioItem.create({ data: { ...data, userId: user.id, position } });
  }
  revalidatePortfolio(user.portfolioSlug);
  return { ok: itemId ? "Saved." : `${ITEM_TYPES[type].singular} added.` };
}

async function ownItem(itemId: string) {
  const user = await requireUser();
  const item = await db.portfolioItem.findUnique({ where: { id: itemId } });
  if (!item || item.userId !== user.id) throw new Error("Item not found");
  return { user, item };
}

export async function deletePortfolioItem(itemId: string) {
  const { user } = await ownItem(itemId);
  await db.portfolioItem.delete({ where: { id: itemId } });
  revalidatePortfolio(user.portfolioSlug);
}

export async function togglePortfolioItem(itemId: string) {
  const { user, item } = await ownItem(itemId);
  await db.portfolioItem.update({ where: { id: itemId }, data: { visible: !item.visible } });
  revalidatePortfolio(user.portfolioSlug);
}

/** Drag-to-reorder: `ids` is the whole list for one type, in its new order. */
export async function reorderPortfolioItems(type: PortfolioItemType, ids: string[]) {
  const user = await requireUser();
  if (!(type in ITEM_TYPES)) return;
  const siblings = await db.portfolioItem.findMany({
    where: { userId: user.id, type },
    orderBy: [{ position: "asc" }, { startDate: "desc" }],
    select: { id: true },
  });
  const updates = orderUpdates(siblings, ids);
  if (!updates?.length) return;
  await db.$transaction(updates.map((u) => db.portfolioItem.update({ where: { id: u.id }, data: { position: u.position } })));
  revalidatePortfolio(user.portfolioSlug);
  revalidatePath("/portfolio");
}

export async function movePortfolioItem(itemId: string, direction: -1 | 1) {
  const { user, item } = await ownItem(itemId);
  const siblings = await db.portfolioItem.findMany({ where: { userId: user.id, type: item.type }, orderBy: [{ position: "asc" }, { startDate: "desc" }] });
  const i = siblings.findIndex((s) => s.id === itemId);
  const j = i + direction;
  if (j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  for (const [position, s] of siblings.entries()) await db.portfolioItem.update({ where: { id: s.id }, data: { position } });
  revalidatePortfolio(user.portfolioSlug);
}

export async function requestVerification(itemId: string) {
  const { user, item } = await ownItem(itemId);
  if (item.verification === "VERIFIED" || item.verification === "REQUESTED") return;
  await db.portfolioItem.update({ where: { id: itemId }, data: { verification: "REQUESTED", verificationNote: null } });
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } });
  await Promise.all(
    admins.map((a) =>
      sendEmail(a.email, `Portfolio verification request: ${user.name}`, [`${user.name} asked ICLCA to verify “${item.title}” (${ITEM_TYPES[item.type].singular}).`], {
        href: appUrl("/admin/portfolio"),
        label: "Review request",
      }),
    ),
  );
  revalidatePortfolio(user.portfolioSlug);
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function decideVerification(itemId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const decision = str(formData.get("decision"));
  if (decision !== "VERIFIED" && decision !== "DECLINED") return { error: "Choose verify or decline." };
  const note = optional(formData.get("note"), 1000);
  if (decision === "DECLINED" && !note) return { error: "Explain why it can't be verified." };
  const item = await db.portfolioItem.update({
    where: { id: itemId },
    data: { verification: decision, verificationNote: note, verifiedById: admin.id, verifiedAt: new Date() },
    include: { user: { select: { email: true, name: true, portfolioSlug: true } } },
  });
  await sendEmail(
    item.user.email,
    decision === "VERIFIED" ? "ICLCA verified an item on your portfolio" : "Update on your portfolio verification request",
    [`Hi ${item.user.name},`, decision === "VERIFIED" ? `“${item.title}” is now marked “Verified by ICLCA” on your portfolio.` : `ICLCA couldn't verify “${item.title}”.`, note ?? ""].filter(Boolean),
    { href: appUrl("/portfolio"), label: "Open my portfolio" },
  );
  revalidatePortfolio(item.user.portfolioSlug);
  revalidatePath("/admin/portfolio");
  return { ok: decision === "VERIFIED" ? "Verified." : "Declined." };
}
