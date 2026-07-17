import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, wsUrl } from "./api";
import { useAuth } from "./auth-context";
import { useAuthedQuery } from "./query";

export type ApiRecord = Record<string, unknown>;

// ---------- A. Code-Aware Viva ----------
// Primary flow is client-side CodeFlow analysis + POST /code-aware/prepare-viva
// (see routes/advanced/viva-code-aware.tsx). Hooks below are optional helpers.

export function useCodeSnapshots() {
  return useAuthedQuery<ApiRecord[]>(["code-snapshots"], "/api/advanced/code-aware/snapshots");
}

// ---------- C. Team Viva Mode (live, voice, AI-hosted group viva) ----------
// The real-time audio/lobby/floor-control connection itself is owned by
// useTeamViva() (src/lib/useTeamViva.ts) — these are just the REST endpoints
// around it: creating the lobby, previewing an invite link, and the report.

export function useCreateTeamViva() {
  return useMutation({
    mutationFn: (body: { team_id: string; project_id?: string | null; subject?: string | null }) =>
      api<ApiRecord>("/api/advanced/team-viva/sessions", { body }),
  });
}

export function useTeamVivaSession(sessionId: string, poll = false) {
  const { isAuthenticated } = useAuth();
  return useQuery<ApiRecord>({
    queryKey: ["team-viva-session", sessionId],
    queryFn: () => api<ApiRecord>(`/api/advanced/team-viva/sessions/${sessionId}`),
    enabled: Boolean(sessionId) && isAuthenticated,
    refetchInterval: poll ? 5_000 : undefined,
  });
}

export function useTeamVivaJoinPreview(joinCode: string | null) {
  const { isAuthenticated } = useAuth();
  return useQuery<ApiRecord>({
    queryKey: ["team-viva-join", joinCode],
    queryFn: () => api<ApiRecord>(`/api/advanced/team-viva/join/${joinCode}`),
    enabled: Boolean(joinCode) && isAuthenticated,
    retry: false,
  });
}

export function useTeamVivaReport(sessionId: string, enabled = true) {
  return useAuthedQuery<ApiRecord>(
    ["team-viva-report", sessionId],
    `/api/advanced/team-viva/${sessionId}/report`,
    enabled && Boolean(sessionId),
  );
}

// ---------- E. Weakness Heatmap ----------

export interface HeatmapCell {
  topic: string;
  avg_score: number;
  question_count: number;
  trend_direction: string;
  [key: string]: unknown;
}

export function useHeatmap(projectId?: string) {
  const path = projectId ? `/api/advanced/heatmap/${projectId}` : "/api/advanced/heatmap/overall";
  return useAuthedQuery<HeatmapCell[]>(["heatmap", projectId ?? "overall"], path);
}

// ---------- G. Real-Time Sentiment (WebSocket) ----------

export function useCreateSentimentSession() {
  return useMutation({
    mutationFn: (body: { project_id?: string | null; duration_minutes?: number }) =>
      api<ApiRecord>("/api/advanced/sentiment/session", { body }),
  });
}

export function useEndSentimentSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      api<ApiRecord>(`/api/advanced/sentiment/${sessionId}/end`, { method: "POST" }),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["sentiment-report", sessionId] });
    },
  });
}

export function useSentimentReport(sessionId: string, enabled = true) {
  return useAuthedQuery<ApiRecord>(
    ["sentiment-report", sessionId],
    `/api/advanced/sentiment/${sessionId}/report`,
    enabled && Boolean(sessionId),
  );
}

export function useSentimentSocket(sessionId: string | null) {
  const [metrics, setMetrics] = useState<ApiRecord | null>(null);
  const [nudges, setNudges] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setMetrics(null);
      setNudges([]);
      setConnected(false);
      return;
    }
    const socket = new WebSocket(wsUrl(`/api/advanced/ws/sentiment/${sessionId}`));
    socketRef.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          metrics?: ApiRecord;
          nudges?: string[];
        };
        if (data.type !== "metrics") return;
        if (data.metrics) setMetrics(data.metrics);
        const incoming = data.nudges ?? [];
        if (incoming.length) setNudges((prev) => [...prev, ...incoming]);
      } catch {
        // Ignore malformed frames.
      }
    };
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [sessionId]);

  const sendFrame = useCallback((dataUrl: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "frame", data: dataUrl, mime_type: "image/jpeg" }));
    }
  }, []);

  return { metrics, nudges, connected, sendFrame };
}
