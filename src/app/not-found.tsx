import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="text-5xl">🧭</span>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="muted">It may have moved, or you may not have access to it.</p>
      <Link href="/dashboard" className="btn-primary mt-2">Back to dashboard</Link>
    </div>
  );
}
