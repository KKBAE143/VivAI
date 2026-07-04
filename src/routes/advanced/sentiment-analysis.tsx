import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Video, Square, Activity } from "lucide-react";
import { AppShell, Card, PageHeader, Badge } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useSentimentSocket } from "@/lib/hooks-advanced";

export const Route = createFileRoute("/advanced/sentiment-analysis")({
  head: () => ({ meta: [{ title: "Real-Time Sentiment — CollgePro Navigator" }] }),
  component: SentimentAnalysis,
});

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span>{label}</span><span className="font-semibold">{value}</span></div>
      <div className="mt-1 h-2 w-full rounded bg-muted">
        <div className={`h-2 rounded ${value < 45 ? "bg-destructive" : value < 70 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function SentimentAnalysis() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const { metrics, nudges, connected, sendFrame } = useSentimentSocket(sessionId);

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      canvas.width = 480;
      canvas.height = (video.videoHeight / video.videoWidth) * 480 || 360;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      sendFrame(canvas.toDataURL("image/jpeg", 0.6));
    }, 2000);
    return () => clearInterval(interval);
  }, [sessionId, sendFrame]);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
    const session = await api<{ id: string }>("/api/advanced/sentiment/session", { body: {} });
    setReport(null);
    setSessionId(session.id);
  };

  const stop = async () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (sessionId) {
      const res = await api<Record<string, unknown>>(`/api/advanced/sentiment/${sessionId}/end`, { method: "POST" });
      setReport(res);
    }
    setSessionId(null);
  };

  return (
    <AppShell>
      <PageHeader title="Real-Time Presentation Sentiment" subtitle="Live AI coaching on confidence, eye contact and energy while you present." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold"><Video className="h-4 w-4" /> Presenter View</h3>
            {sessionId ? (
              <button onClick={stop} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"><Square className="h-3 w-3" /> End Session</button>
            ) : (
              <button onClick={start} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Start Practice</button>
            )}
          </div>
          <video ref={videoRef} autoPlay muted playsInline className="mt-3 w-full rounded-xl bg-black" />
          <canvas ref={canvasRef} className="hidden" />
          {sessionId && (
            <div className="mt-3">
              <Badge tone={connected ? "success" : "warning"}>{connected ? "AI watching — present naturally" : "Connecting…"}</Badge>
              {nudges.slice(-2).map((n, i) => (
                <p key={i} className="mt-2 rounded-lg bg-primary/10 p-2 text-sm font-medium text-primary">💡 {n}</p>
              ))}
            </div>
          )}
        </Card>
        <Card className="lg:col-span-4">
          <h3 className="flex items-center gap-2 text-base font-semibold"><Activity className="h-4 w-4" /> Live Metrics</h3>
          <div className="mt-4 space-y-4">
            <Meter label="Confidence" value={Number(metrics?.confidence ?? 0)} />
            <Meter label="Eye Contact" value={Number(metrics?.eye_contact ?? 0)} />
            <Meter label="Energy" value={Number(metrics?.energy ?? 0)} />
            <Meter label="Stress" value={Number(metrics?.stress ?? 0)} />
            {metrics?.observation && <p className="text-xs text-muted-foreground">{String(metrics.observation)}</p>}
          </div>
          {report && (
            <div className="mt-4 border-t pt-3 text-sm">
              <h4 className="font-semibold">Session Report</h4>
              <p className="mt-1">Overall: <span className="font-bold">{String(report.overall_score ?? "—")}</span></p>
              <p className="text-xs text-muted-foreground">{String(report.feedback_summary ?? "")}</p>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
