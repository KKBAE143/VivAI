import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, wsUrl } from "./api";
import { useAuth } from "./auth-context";
import { useAuthedQuery } from "./query";

export type ApiRecord = Record<string, unknown>;

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

export function useLinkGithub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { github_url: string; project_id?: string | null; name?: string }) =>
      api<ApiRecord>("/api/advanced/code-aware/link-github", { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["code-snapshots"] }),
  });
}

export function useAnalyzeSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (snapshotId: string) =>
      api<ApiRecord>(`/api/advanced/code-aware/analyze?snapshot_id=${encodeURIComponent(snapshotId)}`, {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["code-snapshots"] }),
  });
}

export function useCreateCodeSession() {
  return useMutation({
    mutationFn: (body: { snapshot_id: string; project_id?: string | null; duration_minutes?: number; language?: string }) =>
      api<ApiRecord>("/api/advanced/code-aware/session", { body }),
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

export function useGenerateBridgeQuestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (presentationId: string) =>
      api<ApiRecord>(`/api/advanced/bridge/${presentationId}/generate-questions`, { method: "POST" }),
    onSuccess: (_data, presentationId) => {
      queryClient.invalidateQueries({ queryKey: ["bridge-gaps", presentationId] });
      queryClient.invalidateQueries({ queryKey: ["bridge-history"] });
    },
  });
}

export function useLaunchBridgeViva() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (presentationId: string) =>
      api<ApiRecord>(`/api/advanced/bridge/${presentationId}/launch-viva`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["viva-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["bridge-history"] });
    },
  });
}

// ---------- C. Team Viva Mode (WebSocket) ----------

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

export function useEndTeamViva() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      api<ApiRecord>(`/api/advanced/team-viva/${sessionId}/end`, { method: "POST" }),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["team-viva-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["team-viva-report", sessionId] });
    },
  });
}

export function useTeamVivaReport(sessionId: string, enabled = true) {
  return useAuthedQuery<ApiRecord>(
    ["team-viva-report", sessionId],
    `/api/advanced/team-viva/${sessionId}/report`,
    enabled && Boolean(sessionId),
  );
}

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

export function useFacultyProfile(profileId: string) {
  return useAuthedQuery<ApiRecord>(
    ["faculty-profile", profileId],
    `/api/advanced/faculty-sim/profiles/${profileId}`,
    Boolean(profileId),
  );
}

export function useCreateFacultyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApiRecord) => api<ApiRecord>("/api/advanced/faculty-sim/profiles", { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["faculty-profiles"] }),
  });
}

export function useCreateFacultySession() {
  return useMutation({
    mutationFn: ({ facultyId, ...body }: { facultyId: string } & ApiRecord) =>
      api<ApiRecord>(`/api/advanced/faculty-sim/${facultyId}/session`, { body }),
  });
}

export function useFacultyMySessions() {
  return useAuthedQuery<ApiRecord[]>(["faculty-my-sessions"], "/api/advanced/faculty-sim/my-sessions");
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

export function usePredictorRecent(subject: string) {
  return useAuthedQuery<ApiRecord[]>(
    ["predictor-recent", subject],
    `/api/advanced/predictor/recent-questions/${encodeURIComponent(subject)}`,
    Boolean(subject),
  );
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
