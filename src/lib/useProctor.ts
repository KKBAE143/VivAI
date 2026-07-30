/**
 * Exam conditions in the browser: fullscreen, clipboard, and focus.
 *
 * Everything here is best-effort by nature — a browser cannot be made into a
 * locked-down exam client, and pretending otherwise would be dishonest to the
 * institutions buying this. What it CAN do is make leaving deliberate rather than
 * casual, and leave a record when it happens. The record is the product; the
 * blocking is a speed bump.
 *
 * Two hard rules, both learned from the session engine sitting behind this:
 *
 * - Nothing in here may end or interrupt a session. Proctoring failures are
 *   reported and ignored.
 * - Fullscreen can only be requested from inside a user gesture. So entering on
 *   session start is attempted once and its failure is normal, not an error —
 *   there is a manual button either way.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { captureSilent } from "@/diagnostics/client";

export type ProctorEventKind =
  | "fullscreen_entered"
  | "fullscreen_exited"
  | "fullscreen_exit_requested"
  | "fullscreen_restored"
  | "focus_lost"
  | "focus_regained"
  | "copy_blocked"
  | "paste_blocked"
  | "cut_blocked"
  | "context_menu_blocked"
  | "integrity_warning_shown";

export interface ExitVerdict {
  allowed: boolean;
  justified: boolean;
  message: string;
  recorded_for_review: boolean;
}

/** How long blocked-clipboard warnings stay on screen. */
const WARNING_MS = 4000;

/**
 * Batch window for proctor events.
 *
 * A tab switch produces a pair, and a student leaning on Ctrl+V produces a
 * stream. One request per event would make the proctor trail its own denial of
 * service against the backend during an exam.
 */
const FLUSH_MS = 2500;

export function useProctor(opts: {
  sessionId: string;
  mode: string;
  /** Only enforce while a session is genuinely running. */
  active: boolean;
  /** Sent to the server so it can attribute a turn to a student who left. */
  onFocusChange?: (lost: boolean) => void;
}) {
  const { sessionId, mode, active, onFocusChange } = opts;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [warning, setWarning] = useState("");
  /** Set when the student leaves fullscreen without having been allowed to. */
  const [exitPending, setExitPending] = useState(false);
  const [focusLosses, setFocusLosses] = useState(0);

  /**
   * The session panel.
   *
   * No longer the fullscreen target (see `enterFullscreen`) — kept because the
   * stage still needs a root to attach to, and because a future control may want
   * to scope behaviour to the session rather than the page.
   */
  const rootRef = useRef<HTMLElement | null>(null);
  const queueRef = useRef<{ kind: ProctorEventKind; at_ms: number; detail?: string }[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set while WE are the ones leaving fullscreen, so teardown is not an escape. */
  const releasingRef = useRef(false);
  /** Granted by the judge — the student may stay out without being asked again. */
  const exitAllowedRef = useRef(false);

  const flush = useCallback(() => {
    const events = queueRef.current;
    queueRef.current = [];
    flushTimerRef.current = null;
    if (events.length === 0) return;
    void api("/api/proctor/events", {
      method: "POST",
      body: { session_id: sessionId, mode, events },
    }).catch((e) =>
      // Losing the trail must not interrupt an exam, but it must not be silent:
      // a missing proctor record is exactly what somebody asks about later.
      captureSilent(e, "proctor_events_lost", { feature: "proctor", mode }),
    );
  }, [sessionId, mode]);

  const record = useCallback(
    (kind: ProctorEventKind, detail?: string) => {
      queueRef.current.push({ kind, at_ms: Date.now() - startedAtRef.current, detail });
      if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flush, FLUSH_MS);
    },
    [flush],
  );

  const warn = useCallback((message: string) => {
    setWarning(message);
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    warnTimerRef.current = setTimeout(() => setWarning(""), WARNING_MS);
  }, []);

  const enterFullscreen = useCallback(async () => {
    /*
      Fullscreen the whole DOCUMENT, not the session panel.

      When a single element goes fullscreen, the browser renders that element and
      its descendants and NOTHING else. The "End this session?" confirmation, the
      "Preparing your report…" overlay, toasts and the consent dialog are all
      rendered outside the session panel — as siblings, or in portals on <body> —
      so they became invisible the moment the session entered fullscreen. Pressing
      "End & report" opened a dialog nobody could see, which is exactly why the
      button appeared to do nothing.

      Fullscreening the document root keeps every overlay inside the fullscreen
      subtree, which is also what makes this safe for anything added later.
    */
    const el = document.documentElement;
    if (!el?.requestFullscreen || document.fullscreenElement) return false;
    try {
      await el.requestFullscreen();
      return true;
    } catch (e) {
      // Expected whenever this is not inside a user gesture. Reported because the
      // alternative is silently running an "enforced" exam that never enforced.
      captureSilent(e, "fullscreen_request_failed", { feature: "proctor", mode });
      return false;
    }
  }, [mode]);

  const releaseFullscreen = useCallback(async () => {
    releasingRef.current = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // AUDITED: expected. Exiting when the browser has already left fullscreen.
    } finally {
      // Cleared on the next tick so the fullscreenchange this caused is not read
      // as the student escaping.
      setTimeout(() => {
        releasingRef.current = false;
      }, 250);
    }
  }, []);

  /** Ask the server to judge a stated reason for leaving. */
  const requestExit = useCallback(
    async (reason: string): Promise<ExitVerdict> => {
      record("fullscreen_exit_requested", reason.slice(0, 200));
      flush();
      try {
        const verdict = await api<ExitVerdict>("/api/proctor/fullscreen-exit", {
          method: "POST",
          body: { session_id: sessionId, mode, reason },
        });
        if (verdict.allowed) {
          exitAllowedRef.current = true;
          setExitPending(false);
        }
        return verdict;
      } catch (e) {
        // The judge itself fails open server-side; a NETWORK failure reaching it
        // has to fail open too, for the same reason — a student must never be
        // trapped in fullscreen by an outage they cannot see.
        captureSilent(e, "fullscreen_exit_judge_unreachable", { feature: "proctor", mode });
        exitAllowedRef.current = true;
        setExitPending(false);
        return {
          allowed: true,
          justified: false,
          message:
            "We couldn't reach the invigilator check, so you're out of fullscreen. This has been recorded for review.",
          recorded_for_review: true,
        };
      }
    },
    [sessionId, mode, record, flush],
  );

  // ----------------------------- fullscreen ------------------------------ //
  useEffect(() => {
    const onChange = () => {
      // Any fullscreen element counts. Comparing against one specific node broke
      // the moment the target became the document root, and the question this
      // answers is only ever "are we in fullscreen".
      const inside = Boolean(document.fullscreenElement);
      setIsFullscreen(inside);
      if (!active) return;
      if (inside) {
        exitAllowedRef.current = false;
        setExitPending(false);
        record("fullscreen_entered");
        return;
      }
      if (releasingRef.current || exitAllowedRef.current) return;
      // They left without asking — Escape, F11, or the browser's own control.
      // The session keeps running; they are asked to account for it.
      record("fullscreen_exited");
      setExitPending(true);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [active, record]);

  // ------------------------------- focus --------------------------------- //
  useEffect(() => {
    if (!active) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        setFocusLosses((n) => n + 1);
        record("focus_lost");
        flush(); // do not sit on this one: the tab may not come back
        onFocusChange?.(true);
      } else {
        record("focus_regained");
        onFocusChange?.(false);
      }
    };
    const onBlur = () => {
      // Covers switching to another APPLICATION, where visibilitychange does not
      // fire — which is precisely the phone-beside-the-laptop case.
      if (document.visibilityState === "visible") {
        record("focus_lost", "window_blur");
        onFocusChange?.(true);
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
    };
  }, [active, record, flush, onFocusChange]);

  // ----------------------------- clipboard ------------------------------- //
  useEffect(() => {
    if (!active) return;
    const block = (event: Event, kind: ProctorEventKind, message: string) => {
      // Never block inside the answer box: typing an answer instead of speaking
      // is a supported way to take the exam, and paste is how an accessibility
      // tool delivers text. Copying the QUESTION out is what this is for.
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-proctor-allow-clipboard]")) return;
      event.preventDefault();
      record(kind);
      warn(message);
    };
    const onCopy = (e: Event) => block(e, "copy_blocked", "Copying is disabled during a session.");
    const onCut = (e: Event) => block(e, "cut_blocked", "Cutting is disabled during a session.");
    const onPaste = (e: Event) =>
      block(e, "paste_blocked", "Pasting is disabled — answer in your own words.");
    const onContext = (e: Event) =>
      block(e, "context_menu_blocked", "The right-click menu is disabled during a session.");

    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContext);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContext);
    };
  }, [active, record, warn]);

  // Flush whatever is queued when the session stops or the page goes away.
  useEffect(() => {
    const onLeave = () => flush();
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      flush();
    };
  }, [flush]);

  return {
    rootRef,
    isFullscreen,
    warning,
    exitPending,
    focusLosses,
    enterFullscreen,
    releaseFullscreen,
    requestExit,
    record,
    dismissWarning: () => setWarning(""),
  };
}
