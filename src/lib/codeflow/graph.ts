/** Build dependency edges between project files. */

import { resolveImportTarget } from "./parser";
import type { CodeFile, GraphEdge } from "./types";

export function buildEdges(files: CodeFile[]): GraphEdge[] {
  const paths = new Set(files.map((f) => f.path));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  for (const f of files) {
    const resolved: string[] = [];
    for (const spec of f.imports) {
      const target = resolveImportTarget(f.path, spec, paths);
      if (target && target !== f.path) {
        resolved.push(target);
        const key = `${f.path}->${target}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ from: f.path, to: target });
        }
      }
    }
    f.importPaths = resolved;
  }

  return edges;
}

/** Degree-based ranking for “important” files. */
export function topFilesByConnectivity(files: CodeFile[], edges: GraphEdge[], limit = 20): string[] {
  const score = new Map<string, number>();
  for (const f of files) score.set(f.path, 0);
  for (const e of edges) {
    score.set(e.from, (score.get(e.from) || 0) + 1);
    score.set(e.to, (score.get(e.to) || 0) + 2);
  }
  // Prefer code files and longer files as tie-breakers
  return [...files]
    .sort((a, b) => {
      const ds = (score.get(b.path) || 0) - (score.get(a.path) || 0);
      if (ds !== 0) return ds;
      return b.lines - a.lines;
    })
    .slice(0, limit)
    .map((f) => f.path);
}
