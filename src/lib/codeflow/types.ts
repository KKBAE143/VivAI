/** CodeFlow-ported analysis types for Code-Aware Viva. */

export type Layer =
  | "ui"
  | "components"
  | "services"
  | "utils"
  | "data"
  | "config"
  | "test"
  | "modules";

export interface CodeFile {
  path: string;
  name: string;
  folder: string;
  content: string;
  lines: number;
  language: string;
  layer: Layer;
  isCode: boolean;
  imports: string[];
  importPaths: string[]; // resolved-ish relative targets
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface PatternHit {
  name: string;
  desc: string;
  severity: "info" | "warning";
  isAnti?: boolean;
  files: { name: string; path: string; lines?: number }[];
  metrics?: Record<string, number>;
}

export interface SecurityIssue {
  severity: "high" | "medium" | "low" | "info";
  title: string;
  file: string;
  path: string;
  line?: number;
  desc: string;
  code?: string;
}

export interface HealthScore {
  score: number;
  grade: string;
}

export interface CodeflowStats {
  files: number;
  codeFiles: number;
  lines: number;
  connections: number;
  languages: Record<string, number>;
  layers: Record<string, number>;
}

export interface CodeflowAnalysis {
  files: CodeFile[];
  edges: GraphEdge[];
  patterns: PatternHit[];
  securityIssues: SecurityIssue[];
  health: HealthScore;
  stats: CodeflowStats;
  /** Compact summary for server (no full file bodies). */
  structureSummary: {
    file_list: string[];
    layers: Record<string, string[]>;
    top_files: string[];
    languages: Record<string, number>;
    patterns: PatternHit[];
    security: SecurityIssue[];
    health: HealthScore;
    edges: GraphEdge[];
  };
}
