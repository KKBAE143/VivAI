/**
 * Shared domain types. New code should use these instead of the loose
 * `ApiRecord` (Record<string, unknown>); existing pages are converted
 * opportunistically as they are touched (WS6).
 */

// ---------- Tasks (WS4) ----------
export type TaskStatus = "To Do" | "In Progress" | "Review" | "Done";
export type TaskPriority = "low" | "med" | "high";

export interface Task {
  id: string;
  project_id: string;
  assignee_id?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskMove {
  id: string;
  status: TaskStatus;
  sort_order: number;
}

// ---------- Teams (WS5) ----------
export interface Team {
  id: string;
  name: string;
  project_id?: string | null;
  invite_code?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  profile_id: string;
  role: "Lead" | "Member";
  joined_at?: string;
}

// ---------- Scenario catalog (WS2) ----------
export interface Scenario {
  id: string;
  label: string;
  category: string;
  audience: string;
  icon: string; // lucide icon name (mapped to a component on the client)
  description: string;
  objectives: string[];
  default_duration_min: number;
  requires_camera: boolean;
}

export interface Persona {
  id: string;
  label: string;
  description: string;
}

// ---------- Session report (WS3) ----------
export type SectionStatus = "observed" | "not_observed";
export type Confidence = "high" | "medium" | "low";

export interface ReportDimension {
  id: string;
  label: string;
  weight: number;
  score: number;
  explanation: string;
  evidence_refs: string[];
}

export interface ReportFinding {
  text: string;
  kind: "strength" | "issue" | "note";
  confidence: Confidence;
  evidence_refs: string[];
  quote?: string;
}

export interface ReportSection {
  id: string;
  status: SectionStatus;
  reason?: string;
  findings?: ReportFinding[];
  metrics?: Record<string, unknown>;
}

export interface SessionReport {
  version: number;
  framework: string;
  scenario_id?: string;
  persona?: string;
  availability: { audio: boolean; camera: boolean; screen: boolean; transcript_quality?: string };
  executive_summary: string;
  scores: { overall: number; dimensions: ReportDimension[] };
  sections: ReportSection[];
  timeline?: Array<{ ts_ms: number; label: string; kind: string; evidence_refs?: string[] }>;
  questions?: Array<{ question: string; topic?: string | null; answer?: string | null; score?: number | null; feedback?: string | null }>;
  strengths?: string[];
  /** v2: diagnostic weaknesses (what + why). `improvements` is kept as an
   * alias of the same content for backward compatibility with v1 reports. */
  weaknesses?: string[];
  improvements?: string[];
  /** "How to improve" — concrete, actionable steps tied to a weakness. */
  recommendations?: Array<{ text: string; dimension?: string }>;
  practice_plan?: Array<{ day: string; action: string; scenario_id?: string }>;
  /** v2: what a real evaluator would expect at a professional standard. */
  industry_expectations?: string | null;
  /** v2: topics worth studying, each tied to a specific weakness. */
  resources?: Array<{ topic: string; why: string }>;
  metrics?: Record<string, unknown>;
}
