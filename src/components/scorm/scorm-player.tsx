"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Version = "SCORM_12" | "SCORM_2004";

const CHILDREN_12: Record<string, string> = {
  "cmi.core._children": "student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time",
  "cmi.core.score._children": "raw,min,max",
  "cmi.objectives._children": "id,score,status",
  "cmi.student_data._children": "mastery_score,max_time_allowed,time_limit_action",
  "cmi.student_preference._children": "audio,language,speed,text",
  "cmi.interactions._children": "id,objectives,time,type,correct_responses,weighting,student_response,result,latency",
};
const CHILDREN_2004: Record<string, string> = {
  "cmi._version": "1.0",
  "cmi.score._children": "scaled,raw,min,max",
  "cmi.objectives._children": "id,score,success_status,completion_status,progress_measure,description",
  "cmi.interactions._children": "id,type,objectives,timestamp,correct_responses,weighting,learner_response,result,latency,description",
  "cmi.learner_preference._children": "audio_level,language,delivery_speed,audio_captioning",
  "cmi.comments_from_learner._children": "comment,location,timestamp",
  "cmi.comments_from_lms._children": "comment,location,timestamp",
};
const READ_ONLY_12 = new Set(["cmi.core.student_id", "cmi.core.student_name", "cmi.core.credit", "cmi.core.entry", "cmi.core.total_time", "cmi.core.lesson_mode", "cmi.launch_data", "cmi.student_data.mastery_score"]);
const WRITE_ONLY_12 = new Set(["cmi.core.exit", "cmi.core.session_time"]);
const READ_ONLY_2004 = new Set(["cmi._version", "cmi.learner_id", "cmi.learner_name", "cmi.credit", "cmi.entry", "cmi.total_time", "cmi.mode", "cmi.launch_data", "cmi.completion_threshold", "cmi.scaled_passing_score", "cmi.max_time_allowed", "cmi.time_limit_action"]);
const WRITE_ONLY_2004 = new Set(["cmi.exit", "cmi.session_time"]);

const ERRORS_12: Record<string, string> = {
  "0": "No error",
  "101": "General exception",
  "201": "Invalid argument error",
  "202": "Element cannot have children",
  "203": "Element not an array - cannot have count",
  "301": "Not initialized",
  "401": "Not implemented error",
  "402": "Invalid set value, element is a keyword",
  "403": "Element is read only",
  "404": "Element is write only",
  "405": "Incorrect data type",
};
const ERRORS_2004: Record<string, string> = {
  "0": "No error",
  "101": "General exception",
  "102": "General initialization failure",
  "103": "Already initialized",
  "104": "Content instance terminated",
  "111": "General termination failure",
  "112": "Termination before initialization",
  "113": "Termination after termination",
  "122": "Retrieve data before initialization",
  "123": "Retrieve data after termination",
  "132": "Store data before initialization",
  "133": "Store data after termination",
  "142": "Commit before initialization",
  "143": "Commit after termination",
  "201": "General argument error",
  "301": "General get failure",
  "351": "General set failure",
  "391": "General commit failure",
  "401": "Undefined data model element",
  "403": "Data model element value not initialized",
  "404": "Data model element is read only",
  "405": "Data model element is write only",
  "406": "Data model element type mismatch",
};

/**
 * Hosts a SCORM package in an iframe and exposes the SCORM runtime API on this
 * window so the content (served from the same origin) can find it.
 */
export function ScormPlayer({
  packageId,
  version,
  launchUrl,
  initial,
  preview,
  backHref,
}: {
  packageId: string;
  version: Version;
  launchUrl: string;
  initial: Record<string, string>;
  preview: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"running" | "finished">("running");
  // The iframe is only rendered once the API is installed, so cached content can't load before it exists.
  const [apiReady, setApiReady] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [result, setResult] = useState<{ completionStatus?: string; successStatus?: string; percent?: number | null } | null>(null);
  const runtime = useRef<{ data: Record<string, string>; initialized: boolean; terminated: boolean; dirty: boolean; error: string }>({
    data: { ...initial },
    initialized: false,
    terminated: false,
    dirty: false,
    error: "0",
  });

  useEffect(() => {
    const rt = runtime.current;
    const is12 = version === "SCORM_12";
    const children = is12 ? CHILDREN_12 : CHILDREN_2004;
    const readOnly = is12 ? READ_ONLY_12 : READ_ONLY_2004;
    const writeOnly = is12 ? WRITE_ONLY_12 : WRITE_ONLY_2004;
    const commitUrl = `/api/scorm/${packageId}/commit`;

    const send = (finish: boolean, beacon = false) => {
      const body = JSON.stringify({ cmi: rt.data, finish });
      rt.dirty = false;
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(commitUrl, new Blob([body], { type: "application/json" }));
        return;
      }
      setSaveState("saving");
      return fetch(commitUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60000 })
        .then((r) => r.json())
        .then((json) => {
          setSaveState(json.ok ? "saved" : "error");
          if (json.recorded) setResult(json);
        })
        .catch(() => setSaveState("error"));
    };

    const count = (prefix: string) => {
      const indices = new Set<number>();
      const re = new RegExp(`^${prefix.replace(/\./g, "\\.")}\\.(\\d+)\\.`);
      for (const k of Object.keys(rt.data)) {
        const m = re.exec(k);
        if (m) indices.add(Number(m[1]));
      }
      return String(indices.size ? Math.max(...indices) + 1 : 0);
    };

    const ok = <T,>(v: T) => {
      rt.error = "0";
      return v;
    };
    const fail = <T,>(code: string, v: T) => {
      rt.error = code;
      return v;
    };

    const getValue = (key: string) => {
      if (!rt.initialized) return fail(is12 ? "301" : "122", "");
      if (rt.terminated && !is12) return fail("123", "");
      if (typeof key !== "string" || !key) return fail(is12 ? "201" : "301", "");
      if (!is12 && key.startsWith("adl.nav.request_valid")) return ok("unknown");
      if (!is12 && key === "adl.nav.request") return ok("_none_");
      if (key in children) return ok(children[key]);
      if (key.endsWith("._children")) return fail(is12 ? "202" : "301", "");
      if (key.endsWith("._count")) return ok(count(key.slice(0, -"._count".length)));
      if (writeOnly.has(key)) return fail(is12 ? "404" : "405", "");
      if (key in rt.data) return ok(rt.data[key]);
      // Unset values read as empty strings.
      return ok("");
    };

    const setValue = (key: string, value: unknown) => {
      if (!rt.initialized) return fail(is12 ? "301" : "132", "false");
      if (rt.terminated) return fail(is12 ? "101" : "133", "false");
      // Sequencing/navigation requests are accepted but not acted on (single-SCO player).
      if (!is12 && typeof key === "string" && key.startsWith("adl.nav.")) return ok("true");
      if (typeof key !== "string" || !key.startsWith("cmi.")) return fail(is12 ? "201" : "401", "false");
      if (key.endsWith("._children") || key.endsWith("._count")) return fail(is12 ? "402" : "404", "false");
      if (readOnly.has(key)) return fail(is12 ? "403" : "404", "false");
      rt.data[key] = String(value ?? "");
      rt.dirty = true;
      return ok("true");
    };

    const initialize = (arg: unknown) => {
      if (arg !== "" && arg !== undefined && arg !== null) return fail("201", "false");
      if (rt.terminated) return fail(is12 ? "101" : "104", "false");
      if (rt.initialized) return fail(is12 ? "101" : "103", "false");
      rt.initialized = true;
      return ok("true");
    };

    const commit = (arg: unknown) => {
      if (arg !== "" && arg !== undefined && arg !== null) return fail("201", "false");
      if (!rt.initialized) return fail(is12 ? "301" : "142", "false");
      if (rt.terminated) return fail(is12 ? "101" : "143", "false");
      if (!preview) send(false);
      return ok("true");
    };

    const terminate = (arg: unknown) => {
      if (arg !== "" && arg !== undefined && arg !== null) return fail("201", "false");
      if (!rt.initialized) return fail(is12 ? "301" : "112", "false");
      if (rt.terminated) return fail(is12 ? "101" : "113", "false");
      rt.terminated = true;
      if (!preview) send(true);
      // Let the content finish its own navigation before showing the summary.
      setTimeout(() => setState("finished"), 300);
      return ok("true");
    };

    const errorString = (code: unknown) => (is12 ? ERRORS_12 : ERRORS_2004)[String(code)] ?? "";
    const w = window as unknown as Record<string, unknown>;

    if (is12) {
      w.API = {
        LMSInitialize: initialize,
        LMSFinish: terminate,
        LMSGetValue: getValue,
        LMSSetValue: setValue,
        LMSCommit: commit,
        LMSGetLastError: () => rt.error,
        LMSGetErrorString: errorString,
        LMSGetDiagnostic: (code: unknown) => errorString(code || rt.error),
      };
    } else {
      w.API_1484_11 = {
        Initialize: initialize,
        Terminate: terminate,
        GetValue: getValue,
        SetValue: setValue,
        Commit: commit,
        GetLastError: () => rt.error,
        GetErrorString: errorString,
        GetDiagnostic: (code: unknown) => errorString(code || rt.error),
      };
    }

    setApiReady(true);

    // Autosave periodically, and flush on page exit if the content never called Finish/Terminate.
    const autosave = setInterval(() => {
      if (!preview && rt.initialized && !rt.terminated && rt.dirty) send(false);
    }, 30000);
    const onExit = () => {
      if (!preview && rt.initialized && !rt.terminated) {
        rt.terminated = true;
        send(true, true);
      }
    };
    window.addEventListener("pagehide", onExit);

    return () => {
      clearInterval(autosave);
      window.removeEventListener("pagehide", onExit);
      onExit();
      delete w.API;
      delete w.API_1484_11;
    };
  }, [packageId, version, preview]);

  const exit = async () => {
    const rt = runtime.current;
    if (!preview && rt.initialized && !rt.terminated) {
      rt.terminated = true;
      await fetch(`/api/scorm/${packageId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmi: rt.data, finish: true }),
      }).catch(() => {});
    }
    router.push(backHref);
    router.refresh();
  };

  if (state === "finished") {
    const done = result && (result.completionStatus === "completed" || result.successStatus === "passed" || result.successStatus === "failed");
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <span className="text-5xl">{result?.successStatus === "failed" ? "📚" : done ? "🎉" : "👋"}</span>
        <h2 className="text-xl font-bold">{preview ? "Preview finished" : done ? "Activity complete" : "Progress saved"}</h2>
        {!preview && result?.percent != null && <p className="text-lg">Score: <span className="font-bold">{result.percent}%</span></p>}
        {!preview && !done && <p className="muted text-sm">You can pick up where you left off next time.</p>}
        <Link href={backHref} className="btn-primary mt-2" onClick={() => router.refresh()}>Back to activity</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="muted text-xs">
          {preview ? "Preview mode — progress isn't recorded" : saveState === "saving" ? "Saving…" : saveState === "saved" ? "Progress saved" : saveState === "error" ? "⚠️ Couldn't save — check your connection" : "Your progress saves automatically"}
        </span>
        <button className="btn-secondary btn-sm" onClick={exit}>Save & exit</button>
      </div>
      {apiReady ? (
      <iframe
        src={launchUrl}
        title="SCORM content"
        className="h-[calc(100dvh-13rem)] min-h-[480px] w-full rounded-xl border border-slate-200 bg-white dark:border-slate-800"
        allow="autoplay; fullscreen; clipboard-write"
      />
      ) : (
        <div className="h-[calc(100dvh-13rem)] min-h-[480px] w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      )}
    </div>
  );
}
