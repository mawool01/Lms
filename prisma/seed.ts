/**
 * Demo data for trying out the LMS. Runs only on an empty database.
 *   npm run db:seed
 * All demo accounts use the password: password123
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_PROGRAMS } from "../src/lib/certifications/defaults";

const db = new PrismaClient();
const DAY = 24 * 3600 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);
const id = () => crypto.randomUUID();

const BADGES = [
  { key: "first-steps", name: "First Steps", description: "Completed your first lesson", icon: "👣" },
  { key: "bookworm", name: "Bookworm", description: "Completed 25 lessons", icon: "📚" },
  { key: "quiz-whiz", name: "Quiz Whiz", description: "Scored 100% on a quiz", icon: "🧠" },
  { key: "course-finisher", name: "Course Finisher", description: "Completed every lesson in a course", icon: "🎓" },
  { key: "early-bird", name: "Early Bird", description: "Submitted an assignment at least a day early", icon: "🐦" },
  { key: "conversationalist", name: "Conversationalist", description: "Made 10 forum posts", icon: "💬" },
  { key: "rising-star", name: "Rising Star", description: "Earned 250 points", icon: "⭐" },
  { key: "high-achiever", name: "High Achiever", description: "Earned 1,000 points", icon: "🏆" },
];

async function main() {
  if ((await db.user.count()) > 0) {
    console.log("Database already has users — skipping seed.");
    return;
  }
  const passwordHash = await bcrypt.hash("password123", 10);
  const mk = (name: string, email: string, role: "ADMIN" | "TEACHER" | "STUDENT", bio?: string) =>
    db.user.create({ data: { name, email, role, passwordHash, bio } });

  const admin = await mk("Avery Admin", "admin@iclca.test", "ADMIN", "Platform administrator for ICLCA.");
  const tRivera = await mk("Dr. Maria Rivera", "rivera@iclca.test", "TEACHER", "Biology teacher. I love cells, ecosystems and bad science puns.");
  const tChen = await mk("Mr. David Chen", "chen@iclca.test", "TEACHER", "Mathematics and data literacy.");
  const studentNames = ["Sam Okafor", "Lena Park", "Jordan Miles", "Priya Shah", "Diego Alvarez", "Mia Johnson", "Noah Kim", "Grace Liu"];
  const students = [];
  for (const n of studentNames) {
    students.push(await mk(n, `${n.split(" ")[0].toLowerCase()}@iclca.test`, "STUDENT"));
  }
  for (const b of BADGES) await db.badge.create({ data: b });

  // ─── Course 1: Biology ──────────────────────────────────────────────────
  const bio = await db.course.create({
    data: {
      title: "Introduction to Biology",
      code: "BIO101",
      category: "Science",
      published: true,
      teacherId: tRivera.id,
      meetingUrl: "https://zoom.us/j/1234567890",
      description: "Explore the science of life — from cells and DNA to ecosystems.\n\n**You will learn to:**\n- Describe the structure of cells\n- Explain photosynthesis and respiration\n- Analyze data from simple experiments",
    },
  });
  const bioMods = [
    {
      title: "Cells: the building blocks",
      lessons: [
        {
          title: "What is a cell?",
          blocks: [
            { id: id(), type: "text", markdown: "# The cell\nAll living things are made of **cells**. Some organisms are a single cell; you are made of about **37 trillion** of them.\n\n| Cell type | Has nucleus? | Example |\n|---|---|---|\n| Prokaryotic | No | Bacteria |\n| Eukaryotic | Yes | Plants, animals |" },
            { id: id(), type: "image", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Animal_cell_structure_en.svg/800px-Animal_cell_structure_en.svg.png", caption: "Structure of a typical animal cell" },
            { id: id(), type: "callout", tone: "tip", markdown: "Remember: the **mitochondria** is the powerhouse of the cell!" },
          ],
        },
        {
          title: "Inside the cell (video)",
          blocks: [
            { id: id(), type: "text", markdown: "Watch this short tour of the inside of a cell, then answer the reflection question below." },
            { id: id(), type: "video", url: "https://www.youtube.com/watch?v=URUJD5NEXC8", caption: "A tour of the cell" },
            { id: id(), type: "text", markdown: "**Reflect:** Which organelle surprised you most, and why?" },
          ],
        },
      ],
    },
    {
      title: "Energy for life",
      lessons: [
        {
          title: "Photosynthesis",
          blocks: [
            { id: id(), type: "text", markdown: "Plants convert light energy into chemical energy:\n\n`6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂`" },
            { id: id(), type: "chart", chartType: "line", title: "Rate of photosynthesis vs. light intensity", data: "Light (klx),Oxygen produced (ml/hr)\n0,0\n5,12\n10,22\n20,35\n30,41\n40,43\n50,44" },
            { id: id(), type: "callout", tone: "info", markdown: "Notice how the curve levels off — another factor (like CO₂) becomes *limiting*." },
          ],
        },
        {
          title: "Cellular respiration",
          blocks: [
            { id: id(), type: "text", markdown: "Respiration releases the energy stored in glucose so cells can use it as **ATP**." },
            { id: id(), type: "chart", chartType: "bar", title: "ATP yield by stage", data: "Stage,ATP\nGlycolysis,2\nKrebs cycle,2\nElectron transport,34" },
          ],
        },
      ],
    },
  ];
  const bioLessons: string[] = [];
  for (const [mi, m] of bioMods.entries()) {
    const mod = await db.module.create({ data: { courseId: bio.id, title: m.title, position: mi } });
    for (const [li, l] of m.lessons.entries()) {
      const lesson = await db.lesson.create({ data: { moduleId: mod.id, title: l.title, position: li, blocks: l.blocks as Prisma.InputJsonValue } });
      bioLessons.push(lesson.id);
    }
  }
  const bioQuiz = await db.quiz.create({
    data: {
      courseId: bio.id,
      title: "Cells check-in",
      description: "A quick check on Module 1.",
      published: true,
      passingScore: 70,
      maxAttempts: 3,
      weight: 20,
      dueAt: daysAgo(3),
      questions: {
        create: [
          { type: "MULTIPLE_CHOICE", prompt: "Which organelle is known as the powerhouse of the cell?", options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi body"], answer: "1", points: 1, position: 0 },
          { type: "TRUE_FALSE", prompt: "Bacteria are eukaryotic cells.", options: [], answer: "false", points: 1, position: 1 },
          { type: "SHORT_ANSWER", prompt: "What structure surrounds every cell and controls what enters and leaves?", options: [], answer: "cell membrane|membrane|plasma membrane", points: 2, position: 2 },
          { type: "MULTIPLE_CHOICE", prompt: "Roughly how many cells are in the human body?", options: ["37 thousand", "37 million", "37 trillion"], answer: "2", points: 1, position: 3 },
        ],
      },
    },
    include: { questions: true },
  });
  await db.quiz.create({
    data: {
      courseId: bio.id,
      title: "Energy unit quiz",
      published: true,
      dueAt: daysFromNow(5),
      weight: 30,
      questions: {
        create: [
          { type: "MULTIPLE_CHOICE", prompt: "What gas do plants release during photosynthesis?", options: ["Carbon dioxide", "Oxygen", "Nitrogen"], answer: "1", position: 0 },
          { type: "TRUE_FALSE", prompt: "Most ATP is produced by the electron transport chain.", options: [], answer: "true", position: 1 },
        ],
      },
    },
  });
  const bioAssignment = await db.assignment.create({
    data: {
      courseId: bio.id,
      title: "Lab report: Leaf disc experiment",
      description: "Write up your leaf disc photosynthesis experiment.\n\nInclude **hypothesis, method, results (with a graph) and conclusion**.",
      maxPoints: 50,
      weight: 30,
      published: true,
      dueAt: daysFromNow(7),
    },
  });
  await db.assignment.create({
    data: { courseId: bio.id, title: "Cell model project", description: "Build a 3D model of a plant or animal cell and upload a photo link.", maxPoints: 100, weight: 20, published: true, dueAt: daysAgo(2) },
  });

  // ─── Course 2: Data literacy ────────────────────────────────────────────
  const math = await db.course.create({
    data: {
      title: "Data Literacy & Statistics",
      code: "MATH210",
      category: "Mathematics",
      published: true,
      teacherId: tChen.id,
      description: "Learn to read, question and visualize data like a pro.",
      modules: {
        create: [
          {
            title: "Describing data",
            position: 0,
            lessons: {
              create: [
                { title: "Mean, median and mode", position: 0, blocks: [{ id: id(), type: "text", markdown: "The **mean** is the average, the **median** is the middle value, and the **mode** is the most common value." }, { id: id(), type: "chart", chartType: "bar", title: "Test scores", data: "Score band,Students\n50-59,2\n60-69,5\n70-79,9\n80-89,7\n90-100,3" }] },
                { title: "Reading graphs critically", position: 1, blocks: [{ id: id(), type: "text", markdown: "Always check the **axes**, the **scale**, and the **source**." }, { id: id(), type: "chart", chartType: "pie", title: "How students get to school", data: "Mode,Students\nBus,42\nCar,28\nWalk,18\nBike,12" }] },
              ],
            },
          },
        ],
      },
    },
  });
  const mathLessons = (await db.lesson.findMany({ where: { module: { courseId: math.id } } })).map((l) => l.id);
  await db.course.create({
    data: { title: "World History: Ancient Civilizations", code: "HIST105", category: "Humanities", teacherId: tRivera.id, description: "Draft course — not yet published.", modules: { create: { title: "Mesopotamia", position: 0 } } },
  });

  // ─── Enrollments, activity, points ───────────────────────────────────────
  const award = async (userId: string, points: number, reason: string, sourceKey: string, courseId: string, createdAt: Date) =>
    db.pointEvent.create({ data: { userId, points, reason, sourceKey, courseId, createdAt } });
  const badge = async (userId: string, key: string) => {
    const b = await db.badge.findUniqueOrThrow({ where: { key } });
    await db.userBadge.upsert({ where: { userId_badgeId: { userId, badgeId: b.id } }, update: {}, create: { userId, badgeId: b.id } });
  };

  for (const [si, s] of students.entries()) {
    await db.enrollment.create({ data: { userId: s.id, courseId: bio.id, enrolledAt: daysAgo(30) } });
    if (si % 2 === 0) await db.enrollment.create({ data: { userId: s.id, courseId: math.id, enrolledAt: daysAgo(25) } });

    // Varying engagement: earlier students are more active
    const lessonsDone = Math.max(0, bioLessons.length - Math.floor(si / 2));
    for (let i = 0; i < lessonsDone; i++) {
      const when = daysAgo(20 - i * 4 - (si % 3));
      await db.lessonCompletion.create({ data: { userId: s.id, lessonId: bioLessons[i], completedAt: when } });
      await award(s.id, 10, "Completed a lesson", `lesson:${bioLessons[i]}`, bio.id, when);
    }
    if (lessonsDone > 0) await badge(s.id, "first-steps");
    if (lessonsDone === bioLessons.length) {
      await badge(s.id, "course-finisher");
      await award(s.id, 100, "Completed all lessons in a course", `course-complete:${bio.id}`, bio.id, daysAgo(2));
    }
    if (si % 2 === 0) {
      for (const [i, l] of mathLessons.slice(0, si < 4 ? 2 : 1).entries()) {
        await db.lessonCompletion.create({ data: { userId: s.id, lessonId: l, completedAt: daysAgo(10 - i) } });
        await award(s.id, 10, "Completed a lesson", `lesson:${l}`, math.id, daysAgo(10 - i));
      }
    }

    // Quiz attempts (last two students never attempted)
    if (si < 6) {
      const correctCount = [4, 4, 3, 3, 2, 1][si];
      const answers: Record<string, { value: string; correct: boolean; earned: number }> = {};
      let score = 0;
      bioQuiz.questions.forEach((q, qi) => {
        const correct = qi < correctCount;
        const earned = correct ? q.points : 0;
        score += earned;
        answers[q.id] = { value: correct ? q.answer.split("|")[0] : q.type === "TRUE_FALSE" ? "true" : q.type === "MULTIPLE_CHOICE" ? "0" : "nucleus", correct, earned };
      });
      const max = bioQuiz.questions.reduce((s2, q) => s2 + q.points, 0);
      const percent = Math.round((score / max) * 1000) / 10;
      const when = daysAgo(5 + si);
      await db.quizAttempt.create({ data: { quizId: bioQuiz.id, userId: s.id, answers, score, maxScore: max, percent, passed: percent >= 70, submittedAt: when } });
      if (percent >= 70) await award(s.id, 50, "Passed quiz “Cells check-in”", `quiz-pass:${bioQuiz.id}`, bio.id, when);
      if (percent === 100) {
        await award(s.id, 25, "Perfect score on “Cells check-in”", `quiz-perfect:${bioQuiz.id}`, bio.id, when);
        await badge(s.id, "quiz-whiz");
      }
    }

    // Assignment submissions
    if (si < 5) {
      const graded = si < 3;
      const grade = [48, 44, 38][si];
      await db.submission.create({
        data: {
          assignmentId: bioAssignment.id,
          userId: s.id,
          content: "Hypothesis: more light → more leaf discs float.\n\nResults attached in the linked doc.",
          linkUrl: "https://docs.google.com/document/d/example",
          submittedAt: daysAgo(3 - si * 0.4),
          ...(graded ? { grade, feedback: grade >= 45 ? "Excellent analysis and clear graph!" : "Good work — label your axes next time.", gradedById: tRivera.id, gradedAt: daysAgo(1) } : {}),
        },
      });
      await award(s.id, 20, "Submitted “Lab report”", `assignment-submit:${bioAssignment.id}`, bio.id, daysAgo(3));
      await badge(s.id, "early-bird");
      if (graded && grade / 50 >= 0.9) await award(s.id, 30, "Excellent work on “Lab report”", `assignment-excellent:${bioAssignment.id}`, bio.id, daysAgo(1));
    }
  }

  // ─── Forum, announcements, messages ──────────────────────────────────────
  const thread = await db.forumThread.create({
    data: { courseId: bio.id, authorId: students[1].id, title: "Why does the photosynthesis graph level off?", body: "I get that more light = more oxygen, but why does it stop increasing after ~40 klx?", createdAt: daysAgo(4) },
  });
  await db.forumPost.create({ data: { threadId: thread.id, authorId: students[0].id, body: "I think it's because something else becomes the limiting factor — maybe CO₂?", createdAt: daysAgo(3) } });
  await db.forumPost.create({ data: { threadId: thread.id, authorId: tRivera.id, body: "Exactly right, Sam! 🎉 Temperature can also be limiting. Great discussion.", createdAt: daysAgo(3) } });
  await db.forumThread.create({ data: { courseId: bio.id, authorId: tRivera.id, title: "📌 Study group for the energy unit quiz", body: "Join me Thursday in the course video room for a review session.", pinned: true, createdAt: daysAgo(2) } });
  await db.announcement.create({ data: { courseId: bio.id, authorId: tRivera.id, title: "Welcome to BIO101!", body: "Start with **Module 1** and complete the *Cells check-in* quiz. Live class every Tuesday on Zoom.", createdAt: daysAgo(28) } });
  await db.announcement.create({ data: { courseId: bio.id, authorId: tRivera.id, title: "Lab report due next week", body: "Remember to include a graph of your results.", createdAt: daysAgo(1) } });

  const convo = await db.conversation.create({
    data: { participants: { create: [{ userId: students[0].id, lastReadAt: daysAgo(1) }, { userId: tRivera.id, lastReadAt: daysAgo(1) }] } },
  });
  await db.message.createMany({
    data: [
      { conversationId: convo.id, senderId: students[0].id, body: "Hi Dr. Rivera, can I submit my lab report a day late? I'm at a competition.", createdAt: daysAgo(2) },
      { conversationId: convo.id, senderId: tRivera.id, body: "Of course, Sam — good luck at the competition!", createdAt: daysAgo(1.5) },
    ],
  });
  await db.conversation.create({ data: { participants: { create: [{ userId: admin.id }, { userId: tChen.id }] } } });

  // Point-threshold badges
  for (const s of students) {
    const total = (await db.pointEvent.aggregate({ where: { userId: s.id }, _sum: { points: true } }))._sum.points ?? 0;
    if (total >= 250) await badge(s.id, "rising-star");
  }

  // ─── Certifications ──────────────────────────────────────────────────────
  for (const [pi, p] of DEFAULT_PROGRAMS.entries()) {
    const program = await db.certProgram.create({
      data: {
        key: p.key, name: p.name, kind: p.kind, description: p.description, position: pi,
        initialValidityMonths: p.initialValidityMonths, renewalValidityMonths: p.renewalValidityMonths,
        levels: { create: p.levels.map((l, i) => ({ name: l.name, description: l.description, lifetime: !!l.lifetime, position: i })) },
      },
    });
    await db.certCriterion.createMany({
      data: p.criteria.map((c, i) => ({ programId: program.id, section: c.section, title: c.title, guidance: c.guidance, evidenceRequired: c.evidenceRequired ?? true, position: i })),
    });
  }
  await db.user.updateMany({ where: { id: { in: [admin.id, tRivera.id, tChen.id] } }, data: { certReviewer: true } });
  const lclc = await db.certProgram.findUniqueOrThrow({ where: { key: "lclc" }, include: { levels: { orderBy: { position: "asc" } } } });
  const center = await db.certProgram.findUniqueOrThrow({ where: { key: "lc-certification" }, include: { levels: { orderBy: { position: "asc" } } } });
  const monthsAgo = (m: number) => new Date(Date.now() - m * 30 * DAY);
  await db.certification.createMany({
    data: [
      { code: "ICL-DEMO-RVRA", programId: lclc.id, levelId: lclc.levels[2].id, holderId: tRivera.id, holderName: tRivera.name, holderEmail: tRivera.email, institution: "ICLCA Demo College", issuedAt: monthsAgo(6), expiresAt: daysFromNow(540) },
      { code: "ICL-DEMO-CHEN", programId: lclc.id, levelId: lclc.levels[1].id, holderId: tChen.id, holderName: tChen.name, holderEmail: tChen.email, institution: "ICLCA Demo College", issuedAt: monthsAgo(23), expiresAt: daysFromNow(20) },
      { code: "ICL-DEMO-LIFE", programId: lclc.id, levelId: lclc.levels[3].id, holderName: "Dr. Pat Morgan", holderEmail: "pat.morgan@example.edu", institution: "Example University", issuedAt: monthsAgo(60), expiresAt: null },
      { code: "ICL-DEMO-CNTR", programId: center.id, levelId: center.levels[1].id, holderId: tRivera.id, holderName: tRivera.name, holderEmail: tRivera.email, centerName: "Academic Success Center", institution: "ICLCA Demo College", issuedAt: monthsAgo(12), expiresAt: daysFromNow(4 * 365) },
    ],
  });

  console.log("Seeded demo data. Sign in with e.g. admin@iclca.test / rivera@iclca.test / sam@iclca.test — password: password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
