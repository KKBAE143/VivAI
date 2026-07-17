/** Health score (ported calcHealth, adapted to our stats shape). */

import type { CodeflowStats, HealthScore, PatternHit, SecurityIssue } from "./types";

export function calcHealth(
  stats: CodeflowStats,
  patterns: PatternHit[],
  securityIssues: SecurityIssue[],
): HealthScore {
  let score = 100;

  const long = patterns.filter((p) => p.name === "Long File" || p.name === "God Object");
  score -= Math.min(15, long.length * 4);

  const highSec = securityIssues.filter((i) => i.severity === "high").length;
  score -= Math.min(25, highSec * 5);

  const medSec = securityIssues.filter((i) => i.severity === "medium").length;
  score -= Math.min(10, medSec * 2);

  const avgCoup = stats.files > 0 ? stats.connections / stats.files : 0;
  score -= Math.min(15, Math.max(0, avgCoup - 3) * 2);

  const testFiles = stats.layers.test || 0;
  const testRatio = stats.codeFiles > 0 ? testFiles / stats.codeFiles : 0;
  if (stats.codeFiles > 10 && testRatio < 0.1) score -= 10;

  score = Math.max(0, Math.min(100, Math.round(score)));
  let grade = "F";
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  return { score, grade };
}
