import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, wsUrl } from "./api";
import { useAuth } from "./auth-context";

export type ApiRecord = Record<string, unknown>;

function useAuthedQuery<T>(key: unknown[], path: string, enabled = true) {
  const { isAuthenticated } = useAuth();
  return useQuery<T>({
    queryKey: key,
    queryFn: () => api<T>(path),
    enabled: enabled && isAuthenticated,
  });
}

// ---------- A. Code-Aware Viva ----------

export function useCodeSnapshots() {
  return useAuthedQuery<ApiRecord[]>(["code-snapshots"], "/api/advanced/code-aware/snapshots");
}

export function useCodeUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, projectId }: { file: File; projectId?: string }) => {
      const form = new FormData();
      form.append("file", file);
      if (projectId) form.append("project_id", projectId);
      return api<ApiRecord>("/api/advanced/code-aware/upload", { body: form });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["code-snapshots"] }),
  });
}

// ---------- B. Presentation -> Viva Bridge ----------

export function useBridgeGaps(presentationId: string) {
  return useAuthedQuery<ApiRecord[]>(
    ["bridge-gaps", presentationId],
    `/api/advanced/bridge/${presentationId}/gaps`,
    Boolean(presentationId),
  );
}

export function useBridgeHistory() {
  return useAuthedQuery<ApiRecord[]>(["bridge-history"], "/api/advanced/bridge/history");
}

// ---------- C. Team Viva Mode (WebSocket) ----------

export type TeamVivaMessage = { type: string } & Record<string, unknown>;

export function useTeamVivaSocket(sessionId: string | null, profileId: string | null) {
  const [messages, setMessages] = useState<TeamVivaMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId || !profileId) {
      setMessages([]);
      setConnected(false);
      return;
    }
    const socket = new WebSocket(wsUrl(`/api/advanced/ws/team-viva/${sessionId}/${profileId}`));
    socketRef.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as TeamVivaMessage;
        setMessages((prev) => [...prev, message]);
      } catch {
        // Ignore malformed frames.
      }
    };
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [sessionId, profileId]);

  const send = useCallback((message: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { messages, connected, send };
}

// ---------- D. Faculty Simulation ----------

export function useFacultyProfiles(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return useAuthedQuery<ApiRecord[]>(
    ["faculty-profiles", search ?? ""],
    `/api/advanced/faculty-sim/profiles${query}`,
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

// ---------- F. College Viva Predictor ----------

export function usePredictorTopics(subject: string) {
  return useAuthedQuery<ApiRecord[]>(
    ["predictor-topics", subject],
    `/api/advanced/predictor/topics/${encodeURIComponent(subject)}`,
    Boolean(subject),
  );
}

export function usePredictorTrends(days = 30) {
  return useAuthedQuery<ApiRecord[]>(
    ["predictor-trends", days],
    `/api/advanced/predictor/trends?days=${days}`,
  );
}

export function usePredictorRisk() {
  return useAuthedQuery<ApiRecord[]>(["predictor-risk"], "/api/advanced/predictor/my-risk");
}

// ---------- G. Real-Time Sentiment (WebSocket) ----------

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
