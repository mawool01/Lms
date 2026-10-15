# ICLCA Learning — Learning Management System

A full-featured LMS for ICLCA built with **Next.js 15 (App Router)**, **PostgreSQL + Prisma**, and **Tailwind CSS**, designed to deploy on **Vercel**.

## Features

| Area | What's included |
|---|---|
| **Wild Apricot sign-on** | "Sign in with Wild Apricot" for ICLCA members and contacts (OAuth). New contacts get an account automatically; Wild Apricot account administrators become LMS admins; membership level and status sync at each sign-in and show on profiles and in Admin. Existing LMS accounts connect from Profile → "Connect Wild Apricot" (never taken over by email match). Email/password login remains as a fallback. |
| **Wild Apricot event sync** | Link a Wild Apricot event to a course (Settings → Wild Apricot registrations, or Admin → Wild Apricot) and everyone registered for it is enrolled automatically — paid or unpaid. A course can be fed by several events, so a workshop you run each term stays one course. The sync runs nightly, on demand, and when someone signs in with Wild Apricot; it only ever removes access it granted itself, so manual and self-enrollments are safe, and grades and submissions are never touched. Registrations with no LMS account are listed for an admin. |
| **Portfolio / transcript** | Every user gets a shareable portfolio at `/p/<their-name>` with positions, presentations, publications, service, awards and professional development (with files and links), plus automatic ICLCA records: certifications, completed courses (no grades) and badges. Owners choose Public / Unlisted / Private, can hide or reorder items, and request ICLCA verification; admins verify from Admin → Portfolio verification. Includes a downloadable transcript PDF and print layout. |
| **Branding** | Admin → Branding: site name, short name, organization name (certificates/transcripts), tagline, sign-in page message, primary & accent colors (presets, auto-generated shades kept readable), logo and favicon upload, with live preview. Applies across the app, public pages, PDFs and emails. |
| **User profiles & roles** | Admin / Teacher / Student roles; profile (name, photo, bio); preferences (light/dark/system theme, leaderboard visibility); password change; "your permissions" panel; public profile pages. Admins create users, bulk-import via CSV, assign roles, reset passwords and deactivate accounts. The first account to sign up becomes the admin. |
| **Course management** | Courses → modules → lessons, reorderable. Lesson editor with content blocks: **Markdown text, images, video (YouTube/Vimeo/Loom/MP4), charts & graphs (bar/line/area/pie from CSV data), embeds (Slides, Desmos, PhET, Forms…), files/links, callouts** — with live preview. Optional direct uploads via Vercel Blob. Draft/publish, cover images, categories, enrollment management. |
| **SCORM** | Upload SCORM 1.2 and SCORM 2004 packages (Articulate Storyline/Rise, Captivate, iSpring, Elucidat…) into any module. Built-in player with the full SCORM runtime API: tracks completion, pass/fail, score, time spent, interactions and suspend data (learners resume where they left off). Scores flow into the gradebook with a configurable weight ("grade by score" or "full credit on completion"); teachers can override grades with feedback, reset attempts, mark completion manually, and preview packages without being tracked. Sample packages are in `samples/`. |
| **ICLCA Certifications** | Online applications for the **Learning Center Leadership Certification (LCLC)** (Levels 1–4) and **Learning Center Certification / Learning Center of Excellence**. Applicants (anyone can sign up) answer each criterion with a narrative and evidence (links or uploads), with autosave. Admins mark fees paid, assign a review committee (≥3 recommended), and request changes, approve or deny. Reviewers rate each criterion (does not meet / meets / exceeds) and recommend a decision; applicants see anonymized feedback. Approval issues a certification with automatic expiry (initial 2 years, renewals 5 years, lifetime levels never expire), a **PDF certificate**, a **public verification page** (`/verify`) and a listing in the **public directory** (`/directory`). Includes renewals, expiry reminders, revocation, manual entry and CSV import of existing holders, CSV export, and an admin editor for programs, levels and criteria. |
| **Assessments** | Quizzes (multiple choice, true/false, short answer, and teacher-graded essay) with auto-grading, pass marks, attempt limits, due dates and answer review. Essay attempts show "Awaiting grading" and don't count toward grades or award quiz points until a teacher scores them. Reusable **grading rubrics** (criteria × performance levels; Rubrics in the sidebar) can be attached to assignments and essay questions: learners see the rubric up front, teachers click a level per criterion and the total is scaled to the item's points (the score can still be overridden), and learners get the scored rubric with per-criterion comments. Admins can share rubrics site-wide. **Knowledge check** lesson blocks add ungraded practice questions with instant feedback, explanations and unlimited retries; teachers see first-try class results on the lesson page. Assignments where learners submit documents (PDF, Word, PowerPoint, Excel, images, audio/video — up to 10 files, 100 MB each), text and/or a link; teachers download, grade and give feedback. Weighted course grades with letter grades; student grade breakdowns; teacher gradebook with CSV export. |
| **Analytics & reporting** | Live (auto-refreshing) course analytics: KPIs, 30-day activity, quiz performance vs. pass mark, grade distribution, lesson completion rates, per-question difficulty, and an "at-risk" student list (low grade, inactive, missing work, falling behind). Teacher and admin dashboards. |
| **Communication** | Direct messaging (auto-updating) with one-click video calls; course forums with pinning and moderation; announcements; live classes via the course's Zoom/Meet/Teams link plus a free instant Jitsi video room per course; Learning Center course catalog. |
| **Mobile access** | Fully responsive, bottom tab bar + drawer on phones, installable as a home-screen app (web manifest), dark mode. |
| **Gamification** | Points for lessons, quizzes, assignments, course completion and forum participation; 6 levels; 8 badges; global and per-course leaderboards (students can opt out). |

## Deploying to Vercel

1. **Create a Postgres database.** In the Vercel dashboard: *Storage → Create → Neon (Postgres)* and connect it to the project. (Supabase or any Postgres works too.)
2. **Set environment variables** (Project → Settings → Environment Variables):
   - `DATABASE_URL` — pooled connection string (added automatically by the Neon integration)
   - `DIRECT_URL` — optional: direct (non-pooled) connection used for migrations. If it's not set, the build uses `DATABASE_URL_UNPOOLED` (provided by the Neon integration) automatically.
   - `AUTH_SECRET` — a long random string (`openssl rand -base64 32`)
   - `ALLOW_SIGNUP` — optional; set to `false` so only admins can create accounts
   - `BLOB_READ_WRITE_TOKEN` — added automatically when you create a *Vercel Blob* store (Storage → Create → Blob). **Required for SCORM uploads in production**, and enables the "Upload" button for images/videos/files in the lesson editor. (Locally, without it, SCORM files are stored in `.data/scorm/`.)
3. **Import the GitHub repo into Vercel.** The `vercel-build` script runs `prisma migrate deploy` automatically, so the database schema is created on each deploy.
4. Optional settings:
   - `CRON_SECRET` — any long random string; enables the daily certification-expiry job (`vercel.json` schedules it).
   - `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `ICLCA <certifications@yourdomain.org>`) — send certification emails (submission receipts, review requests, decisions, expiry reminders) through [Resend](https://resend.com). Without them everything works, just without email.
   - `APP_URL` — your site's public address (e.g. `https://learn.iclca.org`) used in emails and on certificates; defaults to the Vercel production URL.
5. **Wild Apricot sign-on** (optional): in Wild Apricot go to *Settings → Integration → Authorized applications → Authorize application → Server application*, give it a name, tick **Wild Apricot login**, and add your LMS domain (e.g. `learn.iclca.org` and/or `your-project.vercel.app`) under **Trusted redirect domains**. Then set in Vercel:
   - `WILDAPRICOT_URL` — your Wild Apricot site address, e.g. `https://iclca.wildapricot.org` (or your custom domain)
   - `WILDAPRICOT_CLIENT_ID` and `WILDAPRICOT_CLIENT_SECRET` — from the authorized application
6. **Wild Apricot event registrations → course enrollments** (optional): in the Wild Apricot admin view go to *Apps → Authorized applications* (older accounts: *Settings → Integration → Authorized applications*) and either open the application you made in step 5 or authorize a new **Server application** for the sync. **The API key is shown under the Application name field**, above the Client ID and Client Secret — a server application issues all three. Make sure that application has access to **events and contacts** (an app restricted to "Wild Apricot login" can't read registrations). A separate application for the sync is tidier, since then rotating its key can't stop people signing in.

   Then set `WILDAPRICOT_API_KEY` in Vercel (and `CRON_SECRET`, which enables the nightly job in `vercel.json`). Link events to courses from **Admin → Wild Apricot** or a course's **Settings** tab.

   How it behaves, so there are no surprises:
   - Any registration grants access, paid or unpaid.
   - Enrollments a teacher or student made by hand are never removed by the sync — only rows it created itself.
   - Cancelling a registration removes that access, but only while the event is upcoming or finished less than 30 days ago, so archiving old Wild Apricot data can't strip access to a course someone already completed.
   - If Wild Apricot can't be reached, that course's roster is left alone rather than emptied; an unusually large removal is reported for confirmation instead of applied.
   - Registrants with no LMS account are listed under Admin → Wild Apricot; create their accounts and the next sync enrolls them.
   - Use **Preview** before the first real run.
7. **Visit the site and sign up** — the first account becomes the administrator. Then add teachers and students from the **Admin** page.

## Local development

```bash
npm install
cp .env.example .env        # fill in a local Postgres URL and AUTH_SECRET
npx prisma migrate deploy
npm run db:seed             # optional demo data (only runs on an empty database)
npm run dev
```

Demo accounts (password `password123`): `admin@iclca.test`, `rivera@iclca.test` (teacher), `chen@iclca.test` (teacher), `sam@iclca.test` (student) and more.

Other scripts: `npm run lint`, `npm run typecheck`, `npm run build`.

## Project structure

```
prisma/schema.prisma       Data model (users, courses, lessons, quizzes, grades, messages, points, badges)
prisma/seed.ts             Demo data
src/app/(auth)/            Sign in / sign up
src/app/(app)/             Authenticated app (dashboard, courses, messages, leaderboard, profile, admin)
src/app/api/               Gradebook CSV export, file upload tokens, nightly cron jobs
src/lib/                   Auth, permissions, grading, analytics, gamification, server actions
src/lib/wildapricot*.ts    Sign-on, event/registration API client, enrollment sync and its rules
src/components/            UI, lesson editor & renderer, charts, chat
scripts/wa-dump.mjs        Dumps real Wild Apricot API payloads (read-only, needs an API key)
scripts/wa-revocation-check.ts  Checks the sync's revocation rules (no database needed)
```

## Notes & next steps

- Video calls link out to Zoom/Meet/Teams or open a free Jitsi room in a new tab (embedding Jitsi's public server is time-limited). A full Zoom API integration (auto-creating meetings) would need a Zoom app + credentials.
- Messages and analytics update by polling (every few seconds / 30s), which works on Vercel without extra services.
- SCORM: packages are served from the app's own domain (required so content can reach the SCORM API), so only upload packages from trusted authors — teachers and admins only can upload. Multi-SCO packages launch their first SCO; SCORM 2004 sequencing/navigation rules are not enforced. Packages up to 500 MB.
- Course emails (announcements, grades) aren't sent yet; certification emails use Resend when configured.
- Certification programs are seeded with placeholder requirements (Admin → Certifications → Programs & criteria → "Load ICLCA defaults"); edit them to match ICLCA's current official criteria.
- Wild Apricot event sync: **before relying on the removal side**, run `WILDAPRICOT_API_KEY=… node scripts/wa-dump.mjs <eventId>` against the real site. Wild Apricot doesn't document its registration `Status` values, so `WA_INELIGIBLE_STATUSES` in `src/lib/wildapricot-rules.ts` ships empty — the dump shows whether a cancelled registration keeps a status or leaves the list altogether, which decides whether anything needs adding there. Granting access works either way. Vercel's Hobby plan allows only two cron jobs, and this feature uses the second.
