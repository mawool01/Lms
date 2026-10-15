"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { criteriaFor, getApplicationAccess, isEditable } from "@/lib/certifications/access";
import { DEFAULT_PROGRAMS } from "@/lib/certifications/defaults";
import { appUrl, sendEmail } from "@/lib/certifications/email";
import { expiryFor, newCertCode } from "@/lib/certifications/status";
import { isSafeUrl } from "@/lib/blocks";
import { orderUpdates } from "@/lib/reorder";
import type { ActionResult } from "@/lib/action-types";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const revalidateCerts = () => revalidatePath("/", "layout");

async function notifyAdmins(subject: string, lines: string[], path: string) {
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } });
  await Promise.all(admins.map((a) => sendEmail(a.email, subject, lines, { href: appUrl(path), label: "Open in ICLCA Learning" })));
}

// ─── Applicants ──────────────────────────────────────────────────────────────

export async function startApplication(programId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const program = await db.certProgram.findUnique({ where: { id: programId }, include: { levels: true } });
  if (!program?.active) return { error: "This program isn't accepting applications." };
  const level = program.levels.find((l) => l.id === str(formData.get("levelId")) && l.active);
  if (!level) return { error: "Choose a level." };
  const centerName = str(formData.get("centerName")) || null;
  const institution = str(formData.get("institution")) || user.institution || null;
  if (program.kind === "CENTER" && (!centerName || !institution)) return { error: "Enter the center's name and institution." };

  // Renewal: must be the applicant's own certification in this program.
  const renewsId = str(formData.get("renewsCertificationId")) || null;
  let previous: { statement: string; responses: { criterionId: string; narrative: string; evidence: string[] }[] } | null = null;
  if (renewsId) {
    const cert = await db.certification.findUnique({ where: { id: renewsId }, include: { application: { include: { responses: true } } } });
    if (!cert || cert.holderId !== user.id || cert.programId !== programId) return { error: "That certification can't be renewed here." };
    previous = cert.application;
  }

  const existing = await db.certApplication.findFirst({
    where: { applicantId: user.id, programId, levelId: level.id, status: { in: ["DRAFT", "CHANGES_REQUESTED", "SUBMITTED", "UNDER_REVIEW"] } },
  });
  if (existing) redirect(`/certifications/applications/${existing.id}`);

  const app = await db.certApplication.create({
    data: {
      programId,
      levelId: level.id,
      applicantId: user.id,
      type: renewsId ? "RENEWAL" : "INITIAL",
      renewsCertificationId: renewsId,
      centerName,
      institution,
      statement: previous?.statement ?? "",
      responses: previous?.responses.length
        ? { create: previous.responses.map((r) => ({ criterionId: r.criterionId, narrative: r.narrative, evidence: r.evidence })) }
        : undefined,
    },
  });
  redirect(`/certifications/applications/${app.id}`);
}

export type ApplicationDraft = {
  statement: string;
  centerName?: string | null;
  institution?: string | null;
  responses: { criterionId: string; narrative: string; evidence: string[] }[];
};

export async function saveApplication(applicationId: string, draft: ApplicationDraft): Promise<ActionResult> {
  const user = await requireUser();
  const { app, isApplicant } = await getApplicationAccess(user, applicationId);
  if (!isApplicant) return { error: "Only the applicant can edit this application." };
  if (!isEditable(app.status)) return { error: "This application can't be edited right now." };
  const criteria = await criteriaFor(app.programId, app.levelId);
  const valid = new Set(criteria.map((c) => c.id));
  for (const r of draft.responses) {
    for (const link of r.evidence) if (link && !isSafeUrl(link)) return { error: `Evidence must be a web link (https://…): ${link}` };
  }
  await db.$transaction([
    db.certApplication.update({
      where: { id: applicationId },
      data: {
        statement: draft.statement.slice(0, 50000),
        ...(app.program.kind === "CENTER"
          ? { centerName: draft.centerName?.trim() || app.centerName, institution: draft.institution?.trim() || app.institution }
          : { institution: draft.institution?.trim() || app.institution }),
      },
    }),
    ...draft.responses
      .filter((r) => valid.has(r.criterionId))
      .map((r) =>
        db.certResponse.upsert({
          where: { applicationId_criterionId: { applicationId, criterionId: r.criterionId } },
          update: { narrative: r.narrative.slice(0, 50000), evidence: r.evidence.filter(Boolean).slice(0, 25) },
          create: { applicationId, criterionId: r.criterionId, narrative: r.narrative.slice(0, 50000), evidence: r.evidence.filter(Boolean).slice(0, 25) },
        }),
      ),
  ]);
  return { ok: "Saved." };
}

export async function submitApplication(applicationId: string, draft: ApplicationDraft): Promise<ActionResult> {
  const saved = await saveApplication(applicationId, draft);
  if (saved?.error) return saved;
  const user = await requireUser();
  const { app } = await getApplicationAccess(user, applicationId);
  const [criteria, responses] = await Promise.all([criteriaFor(app.programId, app.levelId), db.certResponse.findMany({ where: { applicationId } })]);
  const missing: string[] = [];
  for (const c of criteria) {
    const r = responses.find((x) => x.criterionId === c.id);
    if (!r?.narrative.trim()) missing.push(`${c.title} (narrative)`);
    else if (c.evidenceRequired && !r.evidence.length) missing.push(`${c.title} (evidence)`);
  }
  if (app.program.kind === "CENTER" && (!app.centerName || !app.institution)) missing.unshift("Center name and institution");
  if (missing.length) return { error: `Please complete: ${missing.join("; ")}` };

  const resubmission = app.status === "CHANGES_REQUESTED";
  await db.certApplication.update({
    where: { id: applicationId },
    data: { status: resubmission && app.reviews.length ? "UNDER_REVIEW" : "SUBMITTED", submittedAt: new Date() },
  });
  // Reviewers re-score a resubmitted application.
  if (resubmission) await db.certReview.updateMany({ where: { applicationId }, data: { submittedAt: null } });

  await sendEmail(
    app.applicant.email,
    `We received your ${app.program.name} application`,
    [`Hi ${app.applicant.name},`, `Your application for ${app.program.name} — ${app.level.name} has been ${resubmission ? "resubmitted" : "submitted"}. We'll email you when there's an update.`],
    { href: appUrl(`/certifications/applications/${applicationId}`), label: "View application" },
  );
  await notifyAdmins(
    `${resubmission ? "Resubmitted" : "New"} certification application: ${app.applicant.name}`,
    [`${app.applicant.name} ${resubmission ? "resubmitted" : "submitted"} an application for ${app.program.name} — ${app.level.name}.`],
    `/admin/certifications/applications/${applicationId}`,
  );
  revalidateCerts();
  return { ok: "Submitted! We'll be in touch." };
}

export async function withdrawApplication(applicationId: string) {
  const user = await requireUser();
  const { app, isApplicant } = await getApplicationAccess(user, applicationId);
  if (!isApplicant || ["APPROVED", "DENIED", "WITHDRAWN"].includes(app.status)) return;
  if (app.status === "DRAFT") {
    await db.certApplication.delete({ where: { id: applicationId } });
    redirect("/certifications");
  }
  await db.certApplication.update({ where: { id: applicationId }, data: { status: "WITHDRAWN" } });
  revalidateCerts();
}

export async function postCertMessage(applicationId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const { app, isApplicant, isAdmin, isReviewer } = await getApplicationAccess(user, applicationId);
  const body = str(formData.get("body"));
  if (!body) return { error: "Write a message first." };
  const internal = formData.get("internal") === "on" && (isAdmin || isReviewer);
  await db.certMessage.create({ data: { applicationId, authorId: user.id, body: body.slice(0, 10000), internal } });
  if (!internal && !isApplicant) {
    await sendEmail(app.applicant.email, `New message about your ${app.program.name} application`, [body], {
      href: appUrl(`/certifications/applications/${applicationId}`),
      label: "Reply",
    });
  }
  if (isApplicant) await notifyAdmins(`Message from ${app.applicant.name}`, [body], `/admin/certifications/applications/${applicationId}`);
  revalidateCerts();
  return { ok: "" };
}

export async function setDirectoryVisibility(certificationId: string, show: boolean) {
  const user = await requireUser();
  const cert = await db.certification.findUnique({ where: { id: certificationId } });
  if (!cert || (cert.holderId !== user.id && user.role !== "ADMIN")) return;
  await db.certification.update({ where: { id: certificationId }, data: { showInDirectory: show } });
  revalidateCerts();
}

// ─── Reviewers ───────────────────────────────────────────────────────────────

export async function saveReview(applicationId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const { app, myReview } = await getApplicationAccess(user, applicationId);
  if (!myReview) return { error: "You're not assigned to review this application." };
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(app.status)) return { error: "This application isn't open for review." };
  const criteria = await criteriaFor(app.programId, app.levelId);
  const submit = formData.get("intent") === "submit";
  const scores = criteria
    .map((c) => ({ criterionId: c.id, rating: str(formData.get(`rating_${c.id}`)), comment: str(formData.get(`comment_${c.id}`)) }))
    .filter((s) => ["DOES_NOT_MEET", "MEETS", "EXCEEDS"].includes(s.rating));
  const recommendation = str(formData.get("recommendation"));
  if (submit) {
    if (scores.length < criteria.length) return { error: "Rate every criterion before submitting your review." };
    if (!["APPROVE", "REVISE", "DENY"].includes(recommendation)) return { error: "Choose a recommendation." };
  }
  await db.$transaction([
    db.certReview.update({
      where: { id: myReview.id },
      data: {
        comments: str(formData.get("comments")),
        recommendation: (recommendation || null) as "APPROVE" | "REVISE" | "DENY" | null,
        submittedAt: submit ? new Date() : myReview.submittedAt,
      },
    }),
    ...scores.map((s) =>
      db.certReviewScore.upsert({
        where: { reviewId_criterionId: { reviewId: myReview.id, criterionId: s.criterionId } },
        update: { rating: s.rating as "MEETS", comment: s.comment },
        create: { reviewId: myReview.id, criterionId: s.criterionId, rating: s.rating as "MEETS", comment: s.comment },
      }),
    ),
  ]);
  if (submit) {
    const remaining = await db.certReview.count({ where: { applicationId, submittedAt: null } });
    if (remaining === 0) {
      await notifyAdmins(`All reviews are in: ${app.applicant.name}`, [`Every assigned reviewer has scored ${app.applicant.name}'s ${app.program.name} application.`], `/admin/certifications/applications/${applicationId}`);
    }
  }
  revalidateCerts();
  return { ok: submit ? "Review submitted. Thank you!" : "Draft saved." };
}

// ─── Admins ──────────────────────────────────────────────────────────────────

export async function assignReviewer(applicationId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const reviewerId = str(formData.get("reviewerId"));
  const app = await db.certApplication.findUniqueOrThrow({ where: { id: applicationId }, include: { program: true, applicant: true } });
  const reviewer = await db.user.findFirst({ where: { id: reviewerId, active: true } });
  if (!reviewer) return { error: "Choose a reviewer." };
  if (reviewer.id === app.applicantId) return { error: "Applicants can't review their own application." };
  try {
    await db.certReview.create({ data: { applicationId, reviewerId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Already assigned." };
    throw e;
  }
  if (app.status === "SUBMITTED") await db.certApplication.update({ where: { id: applicationId }, data: { status: "UNDER_REVIEW" } });
  await sendEmail(reviewer.email, `Review request: ${app.program.name}`, [`Hi ${reviewer.name},`, `You've been asked to review ${app.applicant.name}'s application for ${app.program.name}.`], {
    href: appUrl(`/certifications/review/${applicationId}`),
    label: "Start review",
  });
  revalidateCerts();
  return { ok: `${reviewer.name} assigned.` };
}

export async function unassignReviewer(reviewId: string) {
  await requireRole("ADMIN");
  await db.certReview.delete({ where: { id: reviewId } });
  revalidateCerts();
}

export async function setFeePaid(applicationId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  await db.certApplication.update({
    where: { id: applicationId },
    data: { feePaid: formData.get("feePaid") === "on", feeNote: str(formData.get("feeNote")) },
  });
  revalidateCerts();
  return { ok: "Payment status saved." };
}

async function issueCertification(
  tx: Prisma.TransactionClient,
  data: Omit<Prisma.CertificationUncheckedCreateInput, "code">,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCertCode();
    if (!(await tx.certification.findUnique({ where: { code } }))) return tx.certification.create({ data: { ...data, code } });
  }
  throw new Error("Couldn't generate a unique certificate code");
}

export async function decideApplication(applicationId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireRole("ADMIN");
  const decision = str(formData.get("decision"));
  const note = str(formData.get("note"));
  const app = await db.certApplication.findUniqueOrThrow({ where: { id: applicationId }, include: { program: true, level: true, applicant: true } });
  if (!["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"].includes(app.status)) return { error: "This application has already been decided." };
  const link = { href: appUrl(`/certifications/applications/${applicationId}`), label: "View application" };

  if (decision === "changes") {
    if (!note) return { error: "Explain what the applicant should change." };
    await db.$transaction([
      db.certApplication.update({ where: { id: applicationId }, data: { status: "CHANGES_REQUESTED", decisionNote: note } }),
      db.certMessage.create({ data: { applicationId, authorId: admin.id, body: `**Changes requested:** ${note}` } }),
    ]);
    await sendEmail(app.applicant.email, `Action needed: your ${app.program.name} application`, [`Hi ${app.applicant.name},`, "The review committee has asked for changes or more information:", note], link);
  } else if (decision === "deny") {
    await db.certApplication.update({ where: { id: applicationId }, data: { status: "DENIED", decidedAt: new Date(), decidedById: admin.id, decisionNote: note || null } });
    await sendEmail(app.applicant.email, `Decision on your ${app.program.name} application`, [`Hi ${app.applicant.name},`, `Your application for ${app.program.name} — ${app.level.name} was not approved at this time.`, note].filter(Boolean), link);
  } else if (decision === "approve") {
    if (!app.feePaid && formData.get("ignoreFee") !== "on") return { error: "The fee isn't marked as paid. Mark it paid, or tick “approve without payment”." };
    const issuedAt = new Date();
    const isRenewal = app.type === "RENEWAL";
    await db.$transaction(async (tx) => {
      await tx.certApplication.update({ where: { id: applicationId }, data: { status: "APPROVED", decidedAt: issuedAt, decidedById: admin.id, decisionNote: note || null } });
      await issueCertification(tx, {
        programId: app.programId,
        levelId: app.levelId,
        holderId: app.applicantId,
        holderName: app.applicant.name,
        holderEmail: app.applicant.email,
        centerName: app.centerName,
        institution: app.institution,
        issuedAt,
        expiresAt: expiryFor(app.program, app.level, isRenewal, issuedAt),
        isRenewal,
        applicationId,
      });
    });
    await sendEmail(app.applicant.email, `Congratulations! ${app.program.name} approved`, [`Hi ${app.applicant.name},`, `Your application for ${app.program.name} — ${app.level.name} has been approved. You can download your certificate now.`, note].filter(Boolean), {
      href: appUrl("/certifications"),
      label: "Download certificate",
    });
  } else {
    return { error: "Choose a decision." };
  }
  revalidateCerts();
  return { ok: "Decision saved." };
}

export async function revokeCertification(certificationId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const reason = str(formData.get("reason"));
  if (!reason) return { error: "Give a reason." };
  await db.certification.update({ where: { id: certificationId }, data: { revokedAt: new Date(), revokeReason: reason } });
  revalidateCerts();
  return { ok: "Certification revoked." };
}

export async function reinstateCertification(certificationId: string) {
  await requireRole("ADMIN");
  await db.certification.update({ where: { id: certificationId }, data: { revokedAt: null, revokeReason: null } });
  revalidateCerts();
}

function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function recordExistingCertification(input: {
  programId: string;
  levelId: string;
  holderName: string;
  holderEmail: string | null;
  centerName: string | null;
  institution: string | null;
  issuedAt: Date;
  expiresAt: Date | null | undefined; // undefined = compute from program rules
  isRenewal: boolean;
}) {
  const [program, level] = await Promise.all([
    db.certProgram.findUniqueOrThrow({ where: { id: input.programId } }),
    db.certLevel.findUniqueOrThrow({ where: { id: input.levelId } }),
  ]);
  const holder = input.holderEmail ? await db.user.findUnique({ where: { email: input.holderEmail } }) : null;
  return db.$transaction((tx) =>
    issueCertification(tx, {
      programId: program.id,
      levelId: level.id,
      holderId: holder?.id ?? null,
      holderName: input.holderName,
      holderEmail: input.holderEmail,
      centerName: input.centerName,
      institution: input.institution,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt === undefined ? expiryFor(program, level, input.isRenewal, input.issuedAt) : input.expiresAt,
      isRenewal: input.isRenewal,
    }),
  );
}

/** Records a certification issued outside the LMS (e.g. existing holders). */
export async function addCertificationManually(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const level = await db.certLevel.findUnique({ where: { id: str(formData.get("levelId")) } });
  if (!level) return { error: "Choose a program and level." };
  const holderName = str(formData.get("holderName"));
  if (!holderName) return { error: "Enter the holder's name." };
  const issuedAt = parseDay(str(formData.get("issuedAt")));
  if (!issuedAt) return { error: "Enter the issue date." };
  const expiresRaw = str(formData.get("expiresAt"));
  const expiresAt = expiresRaw ? parseDay(expiresRaw) : undefined;
  if (expiresRaw && !expiresAt) return { error: "Expiry date is invalid." };
  const cert = await recordExistingCertification({
    programId: level.programId,
    levelId: level.id,
    holderName,
    holderEmail: str(formData.get("holderEmail")).toLowerCase() || null,
    centerName: str(formData.get("centerName")) || null,
    institution: str(formData.get("institution")) || null,
    issuedAt,
    expiresAt,
    isRenewal: formData.get("isRenewal") === "on",
  });
  revalidateCerts();
  return { ok: `Recorded — verification code ${cert.code}.` };
}

/**
 * CSV import, one certification per line:
 *   program key, level name, holder name, email, institution, center name, issued (YYYY-MM-DD), expires (YYYY-MM-DD | lifetime | blank)
 */
export async function importCertifications(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const programs = await db.certProgram.findMany({ include: { levels: true } });
  const lines = str(formData.get("csv")).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let created = 0;
  const problems: string[] = [];
  for (const [i, line] of lines.entries()) {
    const cells = line.split(",").map((c) => c.trim());
    if (i === 0 && cells[0]?.toLowerCase() === "program") continue; // header row
    const [programKey, levelName, holderName, email, institution, centerName, issued, expires] = cells;
    const program = programs.find((p) => p.key.toLowerCase() === programKey?.toLowerCase());
    const level = program?.levels.find((l) => l.name.toLowerCase() === levelName?.toLowerCase());
    const issuedAt = parseDay(issued ?? "");
    const expiresAt = !expires ? undefined : expires.toLowerCase() === "lifetime" ? null : parseDay(expires);
    if (!program || !level || !holderName || !issuedAt || (expiresAt === null && expires?.toLowerCase() !== "lifetime")) {
      problems.push(`line ${i + 1}`);
      continue;
    }
    await recordExistingCertification({
      programId: program.id,
      levelId: level.id,
      holderName,
      holderEmail: email?.toLowerCase() || null,
      centerName: centerName || null,
      institution: institution || null,
      issuedAt,
      expiresAt,
      isRenewal: false,
    });
    created++;
  }
  revalidateCerts();
  return problems.length ? { error: `Imported ${created}. Couldn't read: ${problems.join(", ")}` } : { ok: `Imported ${created} certifications.` };
}

/**
 * Connects an imported certification to the account registered with its email.
 * Done by an admin (not automatically at sign-up) because email addresses aren't verified.
 */
export async function linkCertificationHolder(certificationId: string) {
  await requireRole("ADMIN");
  const cert = await db.certification.findUniqueOrThrow({ where: { id: certificationId } });
  if (!cert.holderEmail) return;
  const user = await db.user.findUnique({ where: { email: cert.holderEmail } });
  if (user) await db.certification.update({ where: { id: certificationId }, data: { holderId: user.id } });
  revalidateCerts();
}

export async function toggleReviewer(userId: string) {
  await requireRole("ADMIN");
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { certReviewer: !u.certReviewer } });
  revalidateCerts();
}

// ─── Program editor ──────────────────────────────────────────────────────────

const clampMonths = (v: FormDataEntryValue | null, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= 600 ? n : fallback;
};

export async function saveProgram(programId: string | null, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const name = str(formData.get("name"));
  if (!name) return { error: "Name is required." };
  const data = {
    name,
    description: str(formData.get("description")),
    kind: formData.get("kind") === "CENTER" ? ("CENTER" as const) : ("INDIVIDUAL" as const),
    initialValidityMonths: clampMonths(formData.get("initialValidityMonths"), 24),
    renewalValidityMonths: clampMonths(formData.get("renewalValidityMonths"), 60),
    active: formData.get("active") === "on",
  };
  if (programId) {
    await db.certProgram.update({ where: { id: programId }, data });
  } else {
    const key = (str(formData.get("key")) || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (await db.certProgram.findUnique({ where: { key } })) return { error: "A program with that key already exists." };
    const program = await db.certProgram.create({ data: { ...data, key, position: await db.certProgram.count() } });
    redirect(`/admin/certifications/programs/${program.id}`);
  }
  revalidateCerts();
  return { ok: "Program saved." };
}

export async function saveLevel(programId: string, levelId: string | null, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const name = str(formData.get("name"));
  if (!name) return { error: "Level name is required." };
  const data = {
    name,
    description: str(formData.get("description")),
    feeNote: str(formData.get("feeNote")),
    lifetime: formData.get("lifetime") === "on",
    active: levelId ? formData.get("active") === "on" : true,
  };
  if (levelId) await db.certLevel.update({ where: { id: levelId }, data });
  else await db.certLevel.create({ data: { ...data, programId, position: await db.certLevel.count({ where: { programId } }) } });
  revalidateCerts();
  return { ok: levelId ? "Level saved." : "Level added." };
}

export async function saveCriterion(programId: string, criterionId: string | null, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("ADMIN");
  const title = str(formData.get("title"));
  if (!title) return { error: "Title is required." };
  const levelId = str(formData.get("levelId")) || null;
  if (levelId && !(await db.certLevel.findFirst({ where: { id: levelId, programId } }))) return { error: "Unknown level." };
  const data = {
    title,
    section: str(formData.get("section")),
    guidance: str(formData.get("guidance")),
    evidenceRequired: formData.get("evidenceRequired") === "on",
    levelId,
    active: criterionId ? formData.get("active") === "on" : true,
  };
  if (criterionId) await db.certCriterion.update({ where: { id: criterionId }, data });
  else await db.certCriterion.create({ data: { ...data, programId, position: await db.certCriterion.count({ where: { programId } }) } });
  revalidateCerts();
  return { ok: criterionId ? "Criterion saved." : "Criterion added." };
}

/** Drag-to-reorder: `ids` is the program's whole criterion list, in its new order. */
export async function reorderCriteria(programId: string, ids: string[]) {
  await requireRole("ADMIN");
  const siblings = await db.certCriterion.findMany({ where: { programId }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true } });
  const updates = orderUpdates(siblings, ids);
  if (!updates?.length) return;
  await db.$transaction(updates.map((u) => db.certCriterion.update({ where: { id: u.id }, data: { position: u.position } })));
  revalidateCerts();
}

export async function moveCriterion(criterionId: string, direction: -1 | 1) {
  await requireRole("ADMIN");
  const c = await db.certCriterion.findUniqueOrThrow({ where: { id: criterionId } });
  const siblings = await db.certCriterion.findMany({ where: { programId: c.programId }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  const i = siblings.findIndex((s) => s.id === criterionId);
  const j = i + direction;
  if (j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  for (const [position, s] of siblings.entries()) await db.certCriterion.update({ where: { id: s.id }, data: { position } });
  revalidateCerts();
}

/** Creates ICLCA's default programs (skips any whose key already exists). */
export async function loadDefaultPrograms() {
  await requireRole("ADMIN");
  for (const [pi, p] of DEFAULT_PROGRAMS.entries()) {
    if (await db.certProgram.findUnique({ where: { key: p.key } })) continue;
    const program = await db.certProgram.create({
      data: {
        key: p.key,
        name: p.name,
        kind: p.kind,
        description: p.description,
        initialValidityMonths: p.initialValidityMonths,
        renewalValidityMonths: p.renewalValidityMonths,
        position: pi,
        levels: { create: p.levels.map((l, i) => ({ name: l.name, description: l.description, lifetime: !!l.lifetime, feeNote: l.feeNote ?? "", position: i })) },
      },
    });
    await db.certCriterion.createMany({
      data: p.criteria.map((c, i) => ({ programId: program.id, section: c.section, title: c.title, guidance: c.guidance, evidenceRequired: c.evidenceRequired ?? true, position: i })),
    });
  }
  revalidateCerts();
}
