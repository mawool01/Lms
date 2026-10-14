/** "Sign in with Wild Apricot" button (plain link: the flow is a series of redirects). */
export function WildApricotButton({ next, label = "Sign in with Wild Apricot" }: { next?: string; label?: string }) {
  const href = `/auth/wildapricot/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <a href={href} className="btn w-full border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
        <path d="M12 2c-1.7 2.4-1.3 4.6.3 6.3C9 8 6 9.6 5 13c-1.3 4.6 2 9 7 9s8.3-4.4 7-9c-1-3.4-4-5-7.3-4.7C13.3 6.6 13.7 4.4 12 2Z" />
      </svg>
      {label}
    </a>
  );
}
