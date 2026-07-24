import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import { useAuthedQuery } from "./query";
import type { Persona, Scenario } from "./types";

// ---------- Live scenario catalog ----------
export function useScenarioCatalog() {
  return useAuthedQuery<Scenario[]>(["catalog", "scenarios"], "/api/catalog/scenarios");
}

export function usePersonaCatalog() {
  return useAuthedQuery<Persona[]>(["catalog", "personas"], "/api/catalog/personas");
}

// ---------- Readiness ----------
export interface ReadinessComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
}
export interface ReadinessAction {
  text: string;
  cta: string;
  to: string;
}
export interface Readiness {
  score: number;
  band: "ready" | "almost" | "building" | "start";
  label: string;
  model?: string;
  components: ReadinessComponent[];
  weak_topics: { topic: string; avg_score: number }[];
  viva_sessions: number;
  presentation_sessions: number;
  actions: ReadinessAction[];
}

export interface Benchmarks {
  available: boolean;
  user_avg?: number;
  percentile?: number;
  peer_label?: string;
  peer_description?: string;
  college?: { name: string; avg: number; students: number };
  branch?: { name: string; avg: number; count: number } | null;
  year?: { name: string; avg: number; count: number } | null;
  user_sessions?: number;
}

export function useReadiness(projectId?: string) {
  const suffix = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  return useAuthedQuery<Readiness>(["readiness", projectId ?? "all"], `/api/readiness${suffix}`);
}

export function useBenchmarks() {
  return useAuthedQuery<Benchmarks>(["readiness", "benchmarks"], "/api/readiness/benchmarks");
}

export function useSwitchDrsModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (model: "v1" | "v2") =>
      api<{ ok: boolean; model: string }>("/api/readiness/model", { method: "PUT", body: { model } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["readiness"] });
    },
  });
}

// ---------- Gamification ----------
export interface Badge {
  id: string;
  label: string;
  desc: string;
  earned: boolean;
  earned_at?: string | null;
}
export interface Gamification {
  xp: number;
  level: number;
  level_floor: number;
  level_ceiling: number;
  into_level: number;
  level_span: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date?: string | null;
  badges: Badge[];
  badges_earned: number;
  badges_total: number;
}

export function useGamification() {
  return useAuthedQuery<Gamification>(["gamification"], "/api/gamification");
}

// ---------- Readiness: pitch drill ----------
export interface PitchResult {
  clarity_score?: number;
  structure_score?: number;
  timing_score?: number;
  overall_score: number;
  covered?: string[];
  missing?: string[];
  feedback?: string;
  improved_pitch?: string;
}

export function useEvaluatePitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { project_id?: string | null; target_seconds: number; transcript: string; actual_seconds: number }) =>
      api<PitchResult>("/api/readiness/pitch", { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gamification"] });
      qc.invalidateQueries({ queryKey: ["readiness"] });
    },
  });
}

// ---------- Delivery scorecard ----------
export interface DeliveryScorecard {
  available: boolean;
  words: number;
  answers_scored?: number;
  avg_wpm: number | null;
  filler_ratio: number;
  filler_total: number;
  top_fillers: { word: string; count: number }[];
  pace_score: number | null;
  fluency_score: number | null;
  clarity_score: number | null;
  tips: string[];
}

export function useVivaDelivery(id: string) {
  return useAuthedQuery<DeliveryScorecard>(["viva-delivery", id], `/api/viva/sessions/${id}/delivery`, Boolean(id));
}

// ---------- Institution Admin ----------
export interface InstitutionDashboard {
  institution: {
    name: string;
    tier: string;
    status: string;
    seat_limit: number;
    seats_used: number;
  };
  total_students: number;
  active_this_week: number;
  avg_drs: number;
  avg_viva_score: number;
  avg_pres_score: number;
  total_vivas: number;
  total_presentations: number;
  readiness_distribution: Record<string, number>;
  branch_breakdown: Record<string, number>;
  year_breakdown: Record<string, number>;
}

export interface InstitutionStudent {
  id: string;
  full_name: string;
  branch: string | null;
  year: string | null;
  drs_score: number;
  drs_band: string;
  drs_label: string;
  viva_sessions: number;
  avg_viva_score: number;
  last_active: string | null;
}

export interface InstitutionStudentsResponse {
  students: InstitutionStudent[];
  total: number;
  page: number;
  per_page: number;
}

export interface InstitutionReadinessReport {
  by_branch: { branch: string; avg_drs: number; students: number }[];
  by_year: { year: string; avg_drs: number; students: number }[];
  weak_topics: { topic: string; avg_score: number; questions: number }[];
}

export interface InstitutionWeakTopic {
  topic: string;
  avg_score: number;
  question_count: number;
}

export function useInstitutionDashboard() {
  return useAuthedQuery<InstitutionDashboard>(["institution", "dashboard"], "/api/institution/dashboard");
}

export function useInstitutionStudents(page = 1, branch?: string, year?: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (branch) params.set("branch", branch);
  if (year) params.set("year", year);
  return useAuthedQuery<InstitutionStudentsResponse>(
    ["institution", "students", String(page), branch ?? "", year ?? ""],
    `/api/institution/students?${params}`,
  );
}

export function useInstitutionReadinessReport() {
  return useAuthedQuery<InstitutionReadinessReport>(["institution", "readiness-report"], "/api/institution/readiness-report");
}

export function useInstitutionWeakTopics() {
  return useAuthedQuery<InstitutionWeakTopic[]>(["institution", "weak-topics"], "/api/institution/weak-topics");
}

export function useInstitutionInvite() {
  return useMutation({
    mutationFn: () => api<{ invite_code: string }>("/api/institution/invite", { method: "POST", body: {} }),
  });
}
