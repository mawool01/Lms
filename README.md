# ICLCA Learning — Learning Management System

A full-featured LMS for ICLCA built with **Next.js 15 (App Router)**, **PostgreSQL + Prisma**, and **Tailwind CSS**, designed to deploy on **Vercel**.

## Features

| Area | What's included |
|---|---|
| **User profiles & roles** | Admin / Teacher / Student roles; profile (name, photo, bio); preferences (light/dark/system theme, leaderboard visibility); password change; "your permissions" panel; public profile pages. Admins create users, bulk-import via CSV, assign roles, reset passwords and deactivate accounts. The first account to sign up becomes the admin. |
| **Course management** | Courses → modules → lessons, reorderable. Lesson editor with content blocks: **Markdown text, images, video (YouTube/Vimeo/Loom/MP4), charts & graphs (bar/line/area/pie from CSV data), embeds (Slides, Desmos, PhET, Forms…), files/links, callouts** — with live preview. Optional direct uploads via Vercel Blob. Draft/publish, cover images, categories, enrollment management. |
| **Assessments** | Quizzes (multiple choice, true/false, short answer) with auto-grading, pass marks, attempt limits, due dates and answer review. Assignments with text/link submissions, teacher grading and feedback. Weighted course grades with letter grades; student grade breakdowns; teacher gradebook with CSV export. |
| **Analytics & reporting** | Live (auto-refreshing) course analytics: KPIs, 30-day activity, quiz performance vs. pass mark, grade distribution, lesson completion rates, per-question difficulty, and an "at-risk" student list (low grade, inactive, missing work, falling behind). Teacher and admin dashboards. |
| **Communication** | Direct messaging (auto-updating) with one-click video calls; course forums with pinning and moderation; announcements; live classes via the course's Zoom/Meet/Teams link plus a free instant Jitsi video room per course; Learning Center course catalog. |
| **Mobile access** | Fully responsive, bottom tab bar + drawer on phones, installable as a home-screen app (web manifest), dark mode. |
| **Gamification** | Points for lessons, quizzes, assignments, course completion and forum participation; 6 levels; 8 badges; global and per-course leaderboards (students can opt out). |

## Deploying to Vercel

1. **Create a Postgres database.** In the Vercel dashboard: *Storage → Create → Neon (Postgres)* and connect it to the project. (Supabase or any Postgres works too.)
2. **Set environment variables** (Project → Settings → Environment Variables):
   - `DATABASE_URL` — pooled connection string
   - `DIRECT_URL` — direct (non-pooled) connection string, used for migrations (Neon on Vercel provides `DATABASE_URL_UNPOOLED`; copy its value here)
   - `AUTH_SECRET` — a long random string (`openssl rand -base64 32`)
   - `ALLOW_SIGNUP` — optional; set to `false` so only admins can create accounts
   - `BLOB_READ_WRITE_TOKEN` — optional; added automatically when you create a *Vercel Blob* store. Enables the "Upload" button for images/videos/files in the lesson editor.
3. **Import the GitHub repo into Vercel.** The `vercel-build` script runs `prisma migrate deploy` automatically, so the database schema is created on each deploy.
4. **Visit the site and sign up** — the first account becomes the administrator. Then add teachers and students from the **Admin** page.

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
src/app/api/               Gradebook CSV export, file upload tokens
src/lib/                   Auth, permissions, grading, analytics, gamification, server actions
src/components/            UI, lesson editor & renderer, charts, chat
```

## Notes & next steps

- Video calls link out to Zoom/Meet/Teams or open a free Jitsi room in a new tab (embedding Jitsi's public server is time-limited). A full Zoom API integration (auto-creating meetings) would need a Zoom app + credentials.
- Messages and analytics update by polling (every few seconds / 30s), which works on Vercel without extra services.
- Email notifications are not yet implemented; they would need an email provider such as Resend.
