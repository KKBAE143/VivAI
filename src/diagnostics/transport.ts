/**
 * Batched, non-blocking delivery of diagnostic events.
 *
 * Rules the app depends on:
 * - `enqueue` is synchronous, O(1), and never throws. Nothing in the app ever
 *   awaits diagnostics.
 * - The queue is bounded. A render loop or reconnect storm drops the oldest
 *   events and records how many, rather than growing until the tab dies.
 * - Delivery targets the SAME ORIGIN (the Vite dev server), not the API. That
 *   means no CORS, no auth, and — critically — it still works when the backend
 *   is down, which is exactly when capture matters most.
 */
import type { DiagBatch, DiagEvent } from "./types";

export const INGEST_PATH = "/__diag/ingest";
const MAX_QUEUED = 200;
const FLUSH_AT = 10;
const FLUSH_INTERVAL_MS = 2000;

type Sender = (url: string, body: string, unloading: boolean) => void;

let queue: DiagEvent[] = [];
let dropped = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let sender: Sender | null = null;

function defaultSender(url: string, body: string, unloading: boolean): void {
  try {
    // sendBeacon survives page unload; fetch does not, reliably.
    if (unloading && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // The dev server is gone; there is nowhere to report that to.
    });
  } catch {
    /* never throw out of diagnostics */
  }
}

/** Swap the sender (tests inject a fake; nothing else should call this). */
export function setSender(next: Sender | null): void {
  sender = next;
}

export function queueSize(): number {
  return queue.length;
}

export function enqueue(event: DiagEvent): void {
  // Statically false in production so Rollup can drop the whole queue, the
  // sender and the endpoint constant from the shipped bundle.
  if (!import.meta.env.DEV) return;
  try {
    queue.push(event);
    if (queue.length > MAX_QUEUED) {
      // Shed the OLDEST: the newest events are the ones nearest the failure.
      dropped += queue.length - MAX_QUEUED;
      queue = queue.slice(-MAX_QUEUED);
    }
    if (queue.length >= FLUSH_AT) {
      flush(false);
    } else if (timer === null && typeof setTimeout === "function") {
      timer = setTimeout(() => flush(false), FLUSH_INTERVAL_MS);
    }
  } catch {
    /* never throw out of diagnostics */
  }
}

export function flush(unloading: boolean): void {
  if (!import.meta.env.DEV) return;
  try {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (queue.length === 0) return;

    const events = queue;
    const droppedCount = dropped;
    queue = [];
    dropped = 0;

    const batch: DiagBatch = {
      run_id: events[0]?.run_id ?? null,
      session_id: events[0]?.session_id ?? null,
      events,
      ...(droppedCount ? { dropped: droppedCount } : {}),
    };
    const body = JSON.stringify(batch);
    const url =
      typeof window !== "undefined" ? `${window.location.origin}${INGEST_PATH}` : INGEST_PATH;
    (sender ?? defaultSender)(url, body, unloading);
  } catch {
    /* never throw out of diagnostics */
  }
}

/** Test helper: reset module state between cases. */
export function _resetTransport(): void {
  queue = [];
  dropped = 0;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  sender = null;
}
