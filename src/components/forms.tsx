"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

import type { ActionResult } from "@/lib/action-types";

export type { ActionResult };
export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

export function SubmitButton({ children, className = "btn-primary", pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/** A form bound to a server action returning {error?, ok?}; shows the message inline. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok !== undefined && !state.error) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>}
    </form>
  );
}

/** A plain form that asks before submitting — for actions that redirect or return nothing. */
export function ConfirmForm({
  action,
  confirm,
  children,
  className,
}: {
  action: () => Promise<void>;
  confirm: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}

/** datetime-local input that submits an ISO string, so the server stores the user's local time correctly. */
export function DateTimeInput({ name, defaultValue, className }: { name: string; defaultValue?: string | null; className?: string }) {
  const [local, setLocal] = useState("");
  useEffect(() => {
    if (!defaultValue) return;
    const d = new Date(defaultValue);
    const pad = (n: number) => String(n).padStart(2, "0");
    setLocal(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }, [defaultValue]);
  const iso = local ? new Date(local).toISOString() : "";
  return (
    <>
      <input type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} className={cn(className)} />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}

/** Renders a date in the viewer's own time zone (server renders in UTC). */
export function LocalTime({ date, mode = "datetime" }: { date: string | Date; mode?: "date" | "datetime" }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date(date);
    setText(
      new Intl.DateTimeFormat(undefined, mode === "date" ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" }).format(d),
    );
  }, [date, mode]);
  return <time dateTime={new Date(date).toISOString()} suppressHydrationWarning>{text ?? ""}</time>;
}
