import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import type { ApiRecord } from "./hooks";
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
  components: ReadinessComponent[];
  weak_topics: { topic: string; avg_score: number }[];
  viva_sessions: number;
  presentation_sessions: number;
  actions: ReadinessAction[];
}

export function useReadiness(projectId?: string) {
  const suffix = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  return useAuthedQuery<Readiness>(["readiness", projectId ?? "all"], `/api/readiness${suffix}`);
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

// ---------- Study: question banks ----------
export interface QuestionBank extends ApiRecord {
  id: string;
  title: string;
  question_count: number;
  card_count?: number;
}

export function useQuestionBanks() {
  return useAuthedQuery<QuestionBank[]>(["question-banks"], "/api/study/banks");
}

export function useQuestionBank(id: string) {
  return useAuthedQuery<ApiRecord>(["question-bank", id], `/api/study/banks/${id}`, Boolean(id));
}

export function useCreateBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      topic?: string;
      source_text?: string;
      file_id?: string;
      project_id?: string | null;
      count?: number;
    }) => api<ApiRecord>("/api/study/banks", { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question-banks"] });
      qc.invalidateQueries({ queryKey: ["flashcard-summary"] });
    },
  });
}

export function useDeleteBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/study/banks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question-banks"] });
      qc.invalidateQueries({ queryKey: ["flashcard-summary"] });
    },
  });
}

export function useBankToViva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; language?: string; difficulty?: string }) =>
      api<ApiRecord>(`/api/study/banks/${id}/to-viva`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["viva-sessions"] }),
  });
}

// ---------- Study: flashcards ----------
export interface Flashcard extends ApiRecord {
  id: string;
  front: string;
  back: string;
  topic?: string | null;
}

export function useDueFlashcards(limit = 30) {
  return useAuthedQuery<Flashcard[]>(["flashcards-due", limit], `/api/study/flashcards/due?limit=${limit}`);
}

export function useFlashcardSummary() {
  return useAuthedQuery<{ total: number; due: number; learned: number }>(
    ["flashcard-summary"],
    "/api/study/flashcards/summary",
  );
}

export function useReviewFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quality }: { id: string; quality: number }) =>
      api<ApiRecord>(`/api/study/flashcards/${id}/review`, { body: { quality } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flashcard-summary"] });
      qc.invalidateQueries({ queryKey: ["gamification"] });
    },
  });
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
