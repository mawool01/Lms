"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { fetchMessages, sendMessage } from "@/lib/actions/community";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";

type Msg = Awaited<ReturnType<typeof fetchMessages>>[number];

const URL_RE = /(https?:\/\/[^\s]+)/g;

function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all underline">{part}</a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Chat thread that polls for new messages every few seconds. */
export function Chat({ conversationId, initial, callUrl }: { conversationId: string; initial: Msg[]; callUrl: string }) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const lastRef = useRef(initial.at(-1)?.createdAt);

  const poll = useCallback(async () => {
    const fresh = await fetchMessages(conversationId, lastRef.current);
    if (fresh.length) {
      lastRef.current = fresh.at(-1)!.createdAt;
      setMessages((m) => {
        const seen = new Set(m.map((x) => x.id));
        return [...m, ...fresh.filter((x) => !seen.has(x.id))];
      });
    }
  }, [conversationId]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") poll().catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = (body: string) => {
    if (!body.trim()) return;
    setText("");
    startTransition(async () => {
      await sendMessage(conversationId, body);
      await poll();
    });
  };

  return (
    <div className="card flex h-[calc(100dvh-15rem)] min-h-[360px] flex-col lg:h-[calc(100dvh-12rem)]">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="muted py-10 text-center text-sm">No messages yet. Say hello 👋</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex items-end gap-2", m.mine && "flex-row-reverse")}>
            {!m.mine && <Avatar name={m.sender.name} url={m.sender.avatarUrl} size={28} />}
            <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap", m.mine ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-slate-100 dark:bg-slate-800")}>
              <Linkified text={m.body} />
              <p className={cn("mt-1 text-[10px]", m.mine ? "text-white/70" : "muted")} suppressHydrationWarning>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <button type="button" className="btn-secondary shrink-0 px-3" title="Start a video call" onClick={() => {
          window.open(callUrl, "_blank", "noopener");
          send(`📹 I started a video call — join here: ${callUrl}`);
        }}>📹</button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          rows={1}
          placeholder="Write a message…"
          aria-label="Message"
          className="resize-none"
        />
        <button className="btn-primary shrink-0" disabled={pending || !text.trim()}>Send</button>
      </form>
    </div>
  );
}
