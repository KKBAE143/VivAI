import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import { useAuth } from "./auth-context";
import { useAuthedQuery } from "./query";
import type { TaskMove, TaskStatus } from "./types";

export type { TaskMove, TaskStatus } from "./types";

export type ApiRecord = Record<string, unknown>;

// ---------- Auth / profile ----------

interface MeResponse {
  id: string;
  email: string;
  profile?: ApiRecord | null;
}

export function useMe() {
  return useAuthedQuery<MeResponse>(["me"], "/api/auth/me");
}

/** Flattened profile: profile table fields plus the auth email and user id. */
export function useProfile() {
  const { isAuthenticated } = useAuth();
  return useQuery<ApiRecord>({
    queryKey: ["profile"],
    queryFn: async () => {
      const me = await api<MeResponse>("/api/auth/me");
      return { id: me.id, email: me.email, ...(me.profile ?? {}) };
    },
    enabled: isAuthenticated,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApiRecord) => api<ApiRecord>("/api/auth/profile", { method: "PUT", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

// ---------- Dashboard / analytics ----------

export interface DashboardStats {
  active_projects: number;
  total_projects: number;
  avg_progress: number;
  pending_tasks: number;
  viva_sessions: number;
  avg_viva_score: number | null;
  presentation_sessions: number;
}

export function useDashboard() {
  return useAuthedQuery<DashboardStats>(["dashboard"], "/api/analytics/dashboard");
}

export function useActivity(limit = 20) {
  return useAuthedQuery<ApiRecord[]>(["activity", limit], `/api/analytics/activity?limit=${limit}`);
}

// ---------- Projects ----------

export function useProjects(type?: string) {
  const filter = type && type !== "All" ? `?type=${encodeURIComponent(type)}` : "";
  return useAuthedQuery<ApiRecord[]>(["projects", type ?? "All"], `/api/projects${filter}`);
}

export function useProject(id: string) {
  return useAuthedQuery<ApiRecord>(["project", id], `/api/projects/${id}`, Boolean(id));
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApiRecord) => api<ApiRecord>("/api/projects", { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ApiRecord) =>
      api<ApiRecord>(`/api/projects/${id}`, { method: "PUT", body }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["project", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, progress }: { id: string; progress: number }) =>
      api<ApiRecord>(`/api/projects/${id}/progress`, { method: "PUT", body: { progress } }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["project", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ---------- Teams ----------

export function useTeams() {
  return useAuthedQuery<ApiRecord[]>(["teams"], "/api/teams");
}

export function useTeam(id: string) {
  return useAuthedQuery<ApiRecord>(["team", id], `/api/teams/${id}`, Boolean(id));
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; project_id?: string | null }) =>
      api<ApiRecord>("/api/teams", { body }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      // Creating a team with project_id also links it (see backend
      // create_team) — the project's cached data (and its Team tab) would
      // otherwise show stale "no team" state until an unrelated refetch.
      if (vars.project_id) {
        queryClient.invalidateQueries({ queryKey: ["project", vars.project_id] });
      }
    },
  });
}

export function useRenameTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, name }: { teamId: string; name: string }) =>
      api<ApiRecord>(`/api/teams/${teamId}`, { method: "PUT", body: { name } }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["team", vars.teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => api(`/api/teams/${teamId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, email }: { teamId: string; email: string }) =>
      api<ApiRecord>(`/api/teams/${teamId}/invite`, { body: { email } }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["team", vars.teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useJoinTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<ApiRecord>("/api/teams/join", { body: { code } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, profileId }: { teamId: string; profileId: string }) =>
      api(`/api/teams/${teamId}/members/${profileId}`, { method: "DELETE" }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["team", vars.teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      teamId,
      profileId,
      role,
    }: {
      teamId: string;
      profileId: string;
      role: string;
    }) =>
      api<ApiRecord>(`/api/teams/${teamId}/members/${profileId}/role`, {
        method: "PUT",
        body: { role },
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["team", vars.teamId] });
    },
  });
}

export function useTeamActivity(teamId: string) {
  return useAuthedQuery<ApiRecord[]>(
    ["team-activity", teamId],
    `/api/teams/${teamId}/activity`,
    Boolean(teamId),
  );
}

export function useTeamIncomingRequests(teamId: string) {
  return useAuthedQuery<ApiRecord[]>(
    ["team-requests", teamId],
    `/api/teams/${teamId}/requests`,
    Boolean(teamId),
  );
}

function useInvalidateTeamLinkQueries() {
  const queryClient = useQueryClient();
  return (projectId?: string, teamId?: string) => {
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-linkable-teams", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-team-requests", projectId] });
    }
    if (teamId) {
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-requests", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-activity", teamId] });
    }
    queryClient.invalidateQueries({ queryKey: ["teams"] });
  };
}

export function useAcceptTeamRequest(teamId: string) {
  const invalidate = useInvalidateTeamLinkQueries();
  return useMutation({
    mutationFn: (requestId: string) =>
      api<ApiRecord>(`/api/teams/${teamId}/requests/${requestId}/accept`),
    onSuccess: () => invalidate(undefined, teamId),
  });
}

export function useDeclineTeamRequest(teamId: string) {
  const invalidate = useInvalidateTeamLinkQueries();
  return useMutation({
    mutationFn: (requestId: string) =>
      api<ApiRecord>(`/api/teams/${teamId}/requests/${requestId}/decline`),
    onSuccess: () => invalidate(undefined, teamId),
  });
}

// ---------- Project <-> Team linking ----------

export function useLinkableTeams(projectId: string) {
  return useAuthedQuery<ApiRecord[]>(
    ["project-linkable-teams", projectId],
    `/api/projects/${projectId}/team/my-teams`,
    Boolean(projectId),
  );
}

export function useProjectTeamRequests(projectId: string) {
  return useAuthedQuery<ApiRecord[]>(
    ["project-team-requests", projectId],
    `/api/projects/${projectId}/team/requests`,
    Boolean(projectId),
  );
}

export function useLinkTeam(projectId: string) {
  const invalidate = useInvalidateTeamLinkQueries();
  return useMutation({
    mutationFn: (teamId: string) =>
      api<ApiRecord>(`/api/projects/${projectId}/team/link`, { body: { team_id: teamId } }),
    onSuccess: (data) => invalidate(projectId, data.team_id as string | undefined),
  });
}

export function useRequestTeamLink(projectId: string) {
  const invalidate = useInvalidateTeamLinkQueries();
  return useMutation({
    mutationFn: (inviteCode: string) =>
      api<ApiRecord>(`/api/projects/${projectId}/team/request`, {
        body: { invite_code: inviteCode },
      }),
    onSuccess: () => invalidate(projectId),
  });
}

export function useUnlinkTeam(projectId: string) {
  const invalidate = useInvalidateTeamLinkQueries();
  return useMutation({
    mutationFn: () => api(`/api/projects/${projectId}/team`, { method: "DELETE" }),
    onSuccess: () => invalidate(projectId),
  });
}

export function useCancelProjectTeamRequest(projectId: string) {
  const invalidate = useInvalidateTeamLinkQueries();
  return useMutation({
    mutationFn: (requestId: string) =>
      api<ApiRecord>(`/api/projects/${projectId}/team/requests/${requestId}/cancel`),
    onSuccess: () => invalidate(projectId),
  });
}

// ---------- Tasks ----------

export function useTasks(projectId?: string) {
  return useAuthedQuery<ApiRecord[]>(
    ["tasks", projectId ?? ""],
    `/api/projects/${projectId}/tasks`,
    Boolean(projectId),
  );
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ...body }: { projectId: string; title: string } & ApiRecord) =>
      api<ApiRecord>(`/api/projects/${projectId}/tasks`, { body }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus; projectId?: string }) =>
      api<ApiRecord>(`/api/tasks/${taskId}/status`, { method: "PUT", body: { status } }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (vars.projectId) queryClient.invalidateQueries({ queryKey: ["project", vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, moves }: { projectId: string; moves: TaskMove[] }) =>
      api<{ ok: boolean }>(`/api/projects/${projectId}/tasks/reorder`, {
        method: "PUT",
        body: { moves },
      }),
    onMutate: async ({ projectId, moves }) => {
      const key = ["project", projectId] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ApiRecord>(key);
      queryClient.setQueryData<ApiRecord>(key, (project) => {
        if (!project || !Array.isArray(project.tasks)) return project;
        const byId = new Map(moves.map((move) => [move.id, move]));
        return {
          ...project,
          tasks: project.tasks.map((task) => {
            const move = byId.get(String((task as ApiRecord).id));
            return move
              ? { ...(task as ApiRecord), status: move.status, sort_order: move.sort_order }
              : task;
          }),
        };
      });
      return { key, previous };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _error, { projectId }) =>
      queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      projectId: _projectId,
      ...body
    }: { taskId: string; projectId?: string } & ApiRecord) =>
      api<ApiRecord>(`/api/tasks/${taskId}`, { method: "PUT", body }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (vars.projectId) queryClient.invalidateQueries({ queryKey: ["project", vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId }: { taskId: string; projectId?: string }) =>
      api(`/api/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (vars.projectId) queryClient.invalidateQueries({ queryKey: ["project", vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ---------- Files ----------

export function useFiles() {
  return useAuthedQuery<ApiRecord[]>(["files"], "/api/files");
}

export function useProjectFiles(projectId?: string) {
  return useAuthedQuery<ApiRecord[]>(
    ["project-files", projectId ?? ""],
    `/api/projects/${projectId}/files`,
    Boolean(projectId),
  );
}

export function useFile(fileId: string) {
  return useAuthedQuery<ApiRecord>(["file", fileId], `/api/files/${fileId}`, Boolean(fileId));
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, projectId }: { file: File; projectId?: string }) => {
      const form = new FormData();
      form.append("file", file);
      if (projectId) form.append("project_id", projectId);
      return api<ApiRecord>("/api/files/upload", { body: form });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["project-files"] });
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => api(`/api/files/${fileId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["project-files"] });
    },
  });
}

// ---------- Templates ----------

export interface TemplateSummary {
  slug: string;
  title: string;
  category: string;
  summary: string;
}

export function useTemplates() {
  return useAuthedQuery<TemplateSummary[]>(["templates"], "/api/templates");
}

export function useTemplate(slug: string) {
  return useAuthedQuery<ApiRecord>(["template", slug], `/api/templates/${slug}`, Boolean(slug));
}

// ---------- Onboarding ----------

export function useOnboardingStatus() {
  return useAuthedQuery<{ complete: boolean }>(["onboarding-status"], "/api/onboarding/status");
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      branch?: string | null;
      year?: string | null;
      goals?: string[];
      role?: string | null;
      institution_code?: string | null;
      department?: string | null;
      subjects?: string[];
    }) => api<ApiRecord>("/api/onboarding/complete", { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

// ---------- Analytics: trends & leaderboard ----------

export function useTrends() {
  return useAuthedQuery<ApiRecord[]>(["trends"], "/api/analytics/trends");
}

export function useLeaderboard() {
  return useAuthedQuery<ApiRecord[]>(["leaderboard"], "/api/analytics/leaderboard");
}

// ---------- AI Viva ----------

export function useVivaSessions() {
  return useAuthedQuery<ApiRecord[]>(["viva-sessions"], "/api/viva/sessions", true, {
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

export function useVivaSession(id: string) {
  return useAuthedQuery<ApiRecord>(["viva-session", id], `/api/viva/sessions/${id}`, Boolean(id));
}

export function useCreateVivaSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApiRecord) => api<ApiRecord>("/api/viva/sessions", { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["viva-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export interface VivaTopicScore {
  topic: string;
  avg_score: number;
  count: number;
}

export interface VivaStats {
  total_sessions: number;
  completed_sessions: number;
  avg_score: number | null;
  weaknesses: VivaTopicScore[];
  strengths: VivaTopicScore[];
}

export function useVivaStats() {
  return useAuthedQuery<VivaStats>(["viva-stats"], "/api/viva/stats");
}

// ---------- AI Presentation ----------

export function usePresentations() {
  return useAuthedQuery<ApiRecord[]>(["presentations"], "/api/presentation/sessions", true, {
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

export function usePresentationSession(id: string) {
  return useAuthedQuery<ApiRecord>(
    ["presentation-session", id],
    `/api/presentation/sessions/${id}`,
    Boolean(id),
  );
}

export function useStartPresentation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<ApiRecord>(`/api/presentation/sessions/${id}/start`, { method: "POST" }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["presentation-session", id] });
      queryClient.invalidateQueries({ queryKey: ["presentations"] });
    },
  });
}

export interface SlideFeedback {
  slide_index: number;
  comments?: string;
  score?: number;
  // backend may return more — pass through with index signature
  [k: string]: unknown;
}

export function useUploadSlide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return api<SlideFeedback>(`/api/presentation/sessions/${id}/upload-slide`, { body: form });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["presentation-session", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["presentations"] });
    },
  });
}

export interface PresentationAskResponse {
  answer: string;
  [k: string]: unknown;
}

export function useAskPresentation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, question }: { id: string; question: string }) =>
      api<PresentationAskResponse>(`/api/presentation/sessions/${id}/ask`, { body: { question } }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["presentation-session", vars.id] });
    },
  });
}

export interface PresentationQuestionResponse {
  question: string;
  topic?: string | null;
  index: number;
}

export function useAskPresentationQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<PresentationQuestionResponse>(`/api/presentation/sessions/${id}/question`, {
        method: "POST",
      }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["presentation-session", id] });
    },
  });
}

export interface PresentationAnswerResponse {
  evaluation: { score: number; feedback?: string; correct?: boolean };
}

export function useAnswerPresentationQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: string }) =>
      api<PresentationAnswerResponse>(`/api/presentation/sessions/${id}/answer`, {
        body: { answer },
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["presentation-session", vars.id] });
    },
  });
}

export function useEndPresentation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<ApiRecord>(`/api/presentation/sessions/${id}/end`, { method: "POST" }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["presentation-session", id] });
      queryClient.invalidateQueries({ queryKey: ["presentations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCreatePresentation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApiRecord) => api<ApiRecord>("/api/presentation/sessions", { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presentations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ---------- Presentation Coach materials ----------

export interface PresentationMaterial extends ApiRecord {
  id: string;
  status?: "queued" | "processing" | "ready" | "partial" | "failed" | string;
  units?: ApiRecord[];
}

export function usePresentationMaterials() {
  // Lightweight polling keeps queued/processing ingestion status current.
  return useAuthedQuery<PresentationMaterial[]>(
    ["presentation-materials"],
    "/api/presentation/materials",
    true,
    {
      refetchInterval: 3000,
    },
  );
}

export function usePresentationMaterial(id?: string) {
  return useAuthedQuery<PresentationMaterial>(
    ["presentation-material", id ?? ""],
    `/api/presentation/materials/${id}`,
    Boolean(id),
    { refetchInterval: 3000 },
  );
}

export function useCreatePresentationMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, projectId }: { fileId: string; projectId?: string | null }) =>
      api<PresentationMaterial>("/api/presentation/materials", {
        body: { file_id: fileId, project_id: projectId ?? null },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presentation-materials"] }),
  });
}

export function useRetryPresentationMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<PresentationMaterial>(`/api/presentation/materials/${id}/retry`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presentation-materials"] }),
  });
}

export function useDeletePresentationMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/presentation/materials/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presentation-materials"] }),
  });
}

// ---------- Generic mutation helper ----------

/**
 * Wraps useMutation for one-off API calls, invalidating the given
 * query key prefixes on success.
 */
export function useApiMutation<TData = unknown, TVars = void>(
  fn: (vars: TVars) => Promise<TData>,
  invalidateKeys: string[] = [],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
