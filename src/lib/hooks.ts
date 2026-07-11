import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import { useAuth } from "./auth-context";
import { useAuthedQuery } from "./query";

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
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
    mutationFn: ({ teamId, profileId, role }: { teamId: string; profileId: string; role: string }) =>
      api<ApiRecord>(`/api/teams/${teamId}/members/${profileId}/role`, { method: "PUT", body: { role } }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["team", vars.teamId] });
    },
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
    mutationFn: ({ taskId, status }: { taskId: string; status: string; projectId?: string }) =>
      api<ApiRecord>(`/api/tasks/${taskId}/status`, { method: "PUT", body: { status } }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (vars.projectId) queryClient.invalidateQueries({ queryKey: ["project", vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, projectId: _projectId, ...body }: { taskId: string; projectId?: string } & ApiRecord) =>
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
    mutationFn: (body: { branch?: string | null; year?: string | null; goals?: string[] }) =>
      api<ApiRecord>("/api/onboarding/complete", { body }),
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
  return useAuthedQuery<ApiRecord[]>(
    ["viva-sessions"],
    "/api/viva/sessions",
    true,
    { refetchOnWindowFocus: true, refetchInterval: 30_000 },
  );
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
  return useAuthedQuery<ApiRecord[]>(
    ["presentations"],
    "/api/presentation/sessions",
    true,
    { refetchOnWindowFocus: true, refetchInterval: 30_000 },
  );
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
    mutationFn: (id: string) => api<ApiRecord>(`/api/presentation/sessions/${id}/start`, { method: "POST" }),
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
      api<PresentationQuestionResponse>(`/api/presentation/sessions/${id}/question`, { method: "POST" }),
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
      api<PresentationAnswerResponse>(`/api/presentation/sessions/${id}/answer`, { body: { answer } }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["presentation-session", vars.id] });
    },
  });
}

export function useEndPresentation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<ApiRecord>(`/api/presentation/sessions/${id}/end`, { method: "POST" }),
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
