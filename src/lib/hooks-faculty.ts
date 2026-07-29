/**
 * Faculty console data hooks (`/api/faculty/*`).
 *
 * Kept in their own module rather than added to the already-large hooks-features
 * so the faculty surface stays easy to hold in one piece.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import { useAuthedQuery } from "./query";

export type SessionStatus = "Pending" | "In Progress" | "Completed";

export interface FacultySessionSummary {
  scheduled: number;
  in_progress: number;
  completed: number;
  /** Completed vivas nobody has signed off — the number that drives action. */
  awaiting_review: number;
  total: number;
}

export interface FacultySession {
  id: string;
  subject: string | null;
  status: SessionStatus;
  score: number | null;
  created_at: string | null;
  completed_at: string | null;
  join_code: string | null;
  team_id: string | null;
  team_name: string | null;
  reviewed_at: string | null;
}

export interface FacultyDashboard {
  summary: FacultySessionSummary;
  sessions: FacultySession[];
}

export interface AssessedVivaQuestion {
  id: string;
  question: string | null;
  answer: string | null;
  score: number | null;
  feedback: string | null;
  topic: string | null;
}

export interface AssessedSessionDetail {
  session: Record<string, unknown> & { id: string; score: number | null; status: SessionStatus };
  questions: AssessedVivaQuestion[];
}

export function useFacultyDashboard() {
  return useAuthedQuery<FacultyDashboard>(["faculty", "dashboard"], "/api/faculty/dashboard");
}

export function useAssessedSession(sessionId: string | null) {
  return useAuthedQuery<AssessedSessionDetail>(
    ["faculty", "session", sessionId ?? ""],
    `/api/faculty/sessions/${sessionId}`,
    Boolean(sessionId),
  );
}

export function useScheduleAssessedViva() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      team_id: string;
      project_id?: string | null;
      subject?: string | null;
      duration_minutes?: number;
    }) =>
      api<{ id: string; join_code: string; team_name: string | null; subject: string | null }>(
        "/api/faculty/team-viva/sessions",
        { body },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["faculty", "dashboard"] });
    },
  });
}

export function useReviewAssessedSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { score_override?: number | null; note?: string | null }) =>
      api<{ ok: boolean; reviewed_at: string; score: number | null; score_overridden: boolean }>(
        `/api/faculty/sessions/${sessionId}/review`,
        { body },
      ),
    onSuccess: () => {
      // Both the list (awaiting_review count) and the detail change.
      void queryClient.invalidateQueries({ queryKey: ["faculty", "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["faculty", "session", sessionId] });
    },
  });
}
