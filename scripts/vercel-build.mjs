// Build script used by Vercel (package.json "vercel-build").
// Vercel's Neon integration provides DATABASE_URL and DATABASE_URL_UNPOOLED but not DIRECT_URL,
// which Prisma needs for migrations, so derive it here instead of requiring a manual setting.
import { spawnSync } from "node:child_process";

const env = process.env;

if (!env.DATABASE_URL) {
  console.error("\n✖ DATABASE_URL is not set. In Vercel: Storage → connect a Postgres (Neon) database to this project, then redeploy.\n");
  process.exit(1);
}
if (!env.AUTH_SECRET) {
  console.error("\n✖ AUTH_SECRET is not set. In Vercel: Settings → Environment Variables → add AUTH_SECRET (a long random string), then redeploy.\n");
  process.exit(1);
}
if (!env.DIRECT_URL) {
  const source = ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DATABASE_URL"].find((k) => env[k]);
  env.DIRECT_URL = env[source];
  console.log(`DIRECT_URL not set — using ${source} for migrations.`);
}

for (const cmd of ["prisma generate", "prisma migrate deploy", "next build"]) {
  console.log(`\n> ${cmd}`);
  const result = spawnSync(`npx ${cmd}`, { stdio: "inherit", shell: true, env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
