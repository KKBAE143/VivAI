import { useMemo, useRef, useState } from "react";
import { Expand, Mic, MicOff, Pause, Play, RefreshCw, Send, Square, Volume2 } from "lucide-react";
import type { PresentationCoachState } from "@/lib/useLiveSession";
import type { ApiRecord } from "@/lib/hooks";
import { MaterialImage } from "./material-image";

interface CoachLive {
  status: string;
  error?: string | null;
  micMuted: boolean;
  paused: boolean;
  aiSpeaking: boolean;
  audioBlocked: boolean;
  captions: { role: "student" | "examiner"; text: string; ts: number }[];
  liveUserText: string;
  liveAiText: string;
  coachState: PresentationCoachState | null;
  toggleMic: () => void;
  togglePause: () => void;
  pushText: (text: string) => void;
  continueAnyway: () => void;
  unlockAudio: () => Promise<void>;
}

export function PresentationCoachStage({
  live,
  material,
  units,
  onEnd,
  onRetry,
  onAbandon,
}: {
  live: CoachLive;
  material: ApiRecord;
  units: ApiRecord[];
  onEnd: () => void;
  onRetry: () => void;
  onAbandon: () => void;
}) {
  const [tab, setTab] = useState<"material" | "coach" | "progress">("material");
  const [zoom, setZoom] = useState(1);
  const [typed, setTyped] = useState("");
  const viewer = useRef<HTMLDivElement | null>(null);
  const ordinal = Number(live.coachState?.current_ordinal ?? live.coachState?.current_unit ?? 1);
  const current = useMemo(
    () => units.find((unit, index) => Number(unit.ordinal ?? index + 1) === ordinal) ?? units[0],
    [units, ordinal],
  );
  const effectiveOrdinal = Number(current?.ordinal ?? ordinal);
  const currentPosition = Math.max(
    0,
    units.findIndex((unit, index) => Number(unit.ordinal ?? index + 1) === effectiveOrdinal),
  );
  const conceptValue = live.coachState?.current_concept ?? live.coachState?.concept;
  const concept =
    typeof conceptValue === "object" && conceptValue
      ? String((conceptValue as ApiRecord).label ?? "Presentation flow")
      : String(conceptValue ?? "Presentation flow");
  const evaluation = live.coachState?.evaluation ?? live.coachState?.recent_evaluation;
  const counters = (live.coachState?.counters as ApiRecord | undefined) ?? {};
  const caption = live.liveAiText || live.liveUserText || live.captions.at(-1)?.text;
  const panel = (kind: typeof tab) => (kind === tab ? "block" : "hidden lg:block");
  const warnings = Array.isArray(material.warnings) ? material.warnings.map(String) : [];
  const content = current?.content as ApiRecord | undefined;
  const elements = Array.isArray(content?.elements) ? (content.elements as ApiRecord[]) : [];
  const fallbackText = elements
    .map((element) => String(element.text ?? ""))
    .filter(Boolean)
    .join("\n\n");
  const statusLabel =
    live.status === "live"
      ? live.aiSpeaking
        ? "AI speaking"
        : "Listening"
      : live.status === "reconnecting"
        ? "Reconnecting"
        : live.status;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Presentation Coach</p>
          <p className="text-xs text-muted-foreground">
            {String(current?.unit_type ?? "Unit")} {effectiveOrdinal} · {currentPosition + 1} of{" "}
            {units.length || "—"} · {concept}
          </p>
        </div>
        <span className="text-xs capitalize text-muted-foreground" aria-live="polite">
          {statusLabel}
        </span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          className={`${panel("material")} min-h-0 border-b border-border p-3 lg:w-3/5 lg:min-w-[45%] lg:max-w-[75%] lg:resize-x lg:overflow-auto lg:border-b-0 lg:border-r`}
        >
          <div
            ref={viewer}
            className="relative flex min-h-[45vh] items-center justify-center overflow-auto rounded-2xl bg-black/5 p-4 dark:bg-white/5"
          >
            <MaterialImage
              materialId={String(material.id)}
              ordinal={effectiveOrdinal}
              alt={`${String(current?.unit_type ?? "Material")} ${effectiveOrdinal}: ${String(current?.title ?? "Untitled")}`}
              className="max-h-[70vh] max-w-full object-contain transition-transform"
              style={{ transform: `scale(${zoom})` }}
              fallback={
                fallbackText ? (
                  <pre className="max-h-[65vh] w-full overflow-auto whitespace-pre-wrap rounded-xl bg-background p-5 text-sm leading-relaxed">
                    {fallbackText}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Preview unavailable for this unit.
                  </p>
                )
              }
            />
          </div>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {String(current?.title ?? `Unit ${effectiveOrdinal}`)}
              </p>
              {warnings.length > 0 && (
                <p className="mt-1 text-xs text-warning">
                  Visual preview may be incomplete: {warnings[0]}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))}
                className="rounded-lg bg-secondary px-3 py-2 text-xs"
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))}
                className="rounded-lg bg-secondary px-3 py-2 text-xs"
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                onClick={() => void viewer.current?.requestFullscreen()}
                className="rounded-lg bg-secondary p-2"
                aria-label="Fullscreen material"
              >
                <Expand className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Material units">
            {units.map((unit, index) => {
              const unitOrdinal = Number(unit.ordinal ?? index + 1);
              return (
                <div
                  key={String(unit.id ?? unitOrdinal)}
                  className={`w-28 shrink-0 overflow-hidden rounded-lg border ${unitOrdinal === effectiveOrdinal ? "border-primary" : "border-border"}`}
                >
                  <MaterialImage
                    materialId={String(material.id)}
                    ordinal={unitOrdinal}
                    thumbnail
                    alt={`Thumbnail ${unitOrdinal}`}
                    className="h-16 w-full object-cover"
                    fallback={
                      <div className="grid h-16 place-items-center bg-secondary text-xs">
                        {unitOrdinal}
                      </div>
                    }
                  />
                  <p className="truncate px-2 py-1 text-[10px]">
                    {unitOrdinal}. {String(unit.title ?? "Unit")}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <aside
          className={`${tab === "coach" || tab === "progress" ? "block" : "hidden lg:block"} min-h-0 flex-1 overflow-y-auto p-4`}
        >
          <div className={`${panel("coach")} rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]`}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Live coach
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              {live.aiSpeaking
                ? "Your coach is responding…"
                : "Present this unit in your own words."}
            </p>
            {caption && (
              <p className="mt-3 rounded-xl bg-secondary p-3 text-sm" aria-live="polite">
                {caption}
              </p>
            )}
            {live.error && <p className="mt-3 text-xs text-destructive">{live.error}</p>}
          </div>
          <div
            className={`${panel("progress")} mt-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Progress and readiness estimate
            </p>
            <p className="mt-2 text-sm font-medium">Current focus: {concept}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Metric label="Units completed" value={counters.units_completed} />
              <Metric label="Concepts mastered" value={counters.concepts_mastered} />
              <Metric label="Needs improvement" value={counters.needs_work} />
              <Metric
                label="Readiness estimate"
                value={
                  counters.readiness_estimate == null
                    ? "—"
                    : `${String(counters.readiness_estimate)}%`
                }
              />
            </div>
            {evaluation ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {typeof evaluation === "string"
                  ? evaluation
                  : String((evaluation as ApiRecord).feedback ?? "Evaluation updated")}
              </p>
            ) : null}
            {live.coachState?.can_continue ? (
              <button
                onClick={live.continueAnyway}
                className="mt-3 rounded-lg border border-border px-3 py-2 text-xs"
              >
                Continue anyway
              </button>
            ) : null}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim()) {
                live.pushText(typed.trim());
                setTyped("");
              }
            }}
            className={`${tab === "coach" ? "flex" : "hidden lg:flex"} mt-4 gap-2`}
          >
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Type if your mic is unavailable"
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              className="rounded-xl bg-primary px-3 text-primary-foreground"
              aria-label="Send typed response"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </aside>
      </main>

      <footer className="sticky bottom-0 z-10 flex items-center justify-center gap-3 border-t border-border bg-background p-3">
        {live.status === "error" ? (
          <button
            onClick={onRetry}
            className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            <RefreshCw className="mr-1 inline h-4 w-4" /> Retry connection
          </button>
        ) : live.status === "aborted" ? (
          <button
            onClick={onAbandon}
            className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            Return to sessions
          </button>
        ) : (
          <>
            <button
              onClick={live.toggleMic}
              className="rounded-xl bg-secondary p-3"
              aria-label="Toggle microphone"
            >
              {live.micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button
              onClick={live.togglePause}
              className="rounded-xl bg-secondary p-3"
              aria-label="Pause live session"
            >
              {live.paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
            {live.audioBlocked ? (
              <button
                onClick={() => void live.unlockAudio()}
                className="rounded-xl bg-warning/15 px-3 py-2 text-xs font-semibold text-warning"
              >
                <Volume2 className="mr-1 inline h-4 w-4" />
                Enable audio
              </button>
            ) : (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                <Volume2 className="mr-1 inline h-3.5 w-3.5" />
                Audio ready
              </span>
            )}
            <button
              onClick={onEnd}
              className="rounded-xl bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground"
            >
              <Square className="mr-1 inline h-4 w-4" /> End
            </button>
          </>
        )}
      </footer>
      <nav className="flex border-t border-border lg:hidden">
        {(["material", "coach", "progress"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`flex-1 py-3 text-xs font-semibold capitalize ${tab === item ? "text-primary" : "text-muted-foreground"}`}
          >
            {item}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg bg-secondary p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{String(value ?? 0)}</p>
    </div>
  );
}
