/** Unzip a project archive and run the full CodeFlow-style analysis. */

import JSZip from "jszip";

import { ANALYSIS_LIMITS, shouldSkipPath } from "./ignore";
import { buildEdges, topFilesByConnectivity } from "./graph";
import { calcHealth } from "./health";
import { buildCodeFile, isIncluded } from "./parser";
import { detectPatterns } from "./patterns";
import { detectSecurity } from "./security";
import type { CodeFile, CodeflowAnalysis, CodeflowStats } from "./types";

export type AnalyzeProgress = (phase: string, detail?: string) => void;

function stripArchiveRoot(paths: string[]): Map<string, string> {
  /** Map original zip path → normalized path without single top-level folder. */
  const cleaned = paths.map((p) => p.replace(/\\/g, "/"));
  const tops = new Set(
    cleaned
      .filter((p) => p && !p.endsWith("/"))
      .map((p) => p.split("/")[0])
      .filter(Boolean),
  );
  const map = new Map<string, string>();
  if (tops.size === 1) {
    const root = [...tops][0];
    for (const p of cleaned) {
      if (p === root || p.startsWith(root + "/")) {
        const next = p === root ? "" : p.slice(root.length + 1);
        if (next) map.set(p, next);
      }
    }
  } else {
    for (const p of cleaned) map.set(p, p);
  }
  return map;
}

export async function analyzeZip(
  file: File | Blob,
  onProgress?: AnalyzeProgress,
): Promise<CodeflowAnalysis> {
  onProgress?.("unzip", "Reading ZIP…");
  const zip = await JSZip.loadAsync(file);
  const entries = Object.keys(zip.files).filter((k) => !zip.files[k].dir);
  const pathMap = stripArchiveRoot(entries);

  const files: CodeFile[] = [];
  let totalChars = 0;

  onProgress?.("parse", "Parsing source files…");
  for (const original of entries) {
    if (files.length >= ANALYSIS_LIMITS.maxFiles) break;
    const normalized = pathMap.get(original.replace(/\\/g, "/")) || original.replace(/\\/g, "/");
    if (!normalized || shouldSkipPath(normalized)) continue;
    const name = normalized.split("/").pop() || normalized;
    if (!isIncluded(name)) continue;

    try {
      let content = await zip.files[original].async("string");
      if (content.length > ANALYSIS_LIMITS.maxFileChars) {
        content = content.slice(0, ANALYSIS_LIMITS.maxFileChars);
      }
      if (totalChars + content.length > ANALYSIS_LIMITS.maxTotalChars) break;
      totalChars += content.length;
      files.push(buildCodeFile(normalized, content));
    } catch {
      // binary / undecodable
    }
  }

  if (!files.length) {
    throw new Error("No readable source files found in this ZIP. Try a project source archive.");
  }

  onProgress?.("graph", "Building dependency graph…");
  const edges = buildEdges(files);

  onProgress?.("patterns", "Detecting patterns & risks…");
  const patterns = detectPatterns(files);
  const securityIssues = detectSecurity(files);

  const languages: Record<string, number> = {};
  const layers: Record<string, number> = {};
  let codeFiles = 0;
  let lines = 0;
  for (const f of files) {
    languages[f.language] = (languages[f.language] || 0) + 1;
    layers[f.layer] = (layers[f.layer] || 0) + 1;
    if (f.isCode) codeFiles += 1;
    lines += f.lines;
  }

  const stats: CodeflowStats = {
    files: files.length,
    codeFiles,
    lines,
    connections: edges.length,
    languages,
    layers,
  };

  const health = calcHealth(stats, patterns, securityIssues);
  const top = topFilesByConnectivity(files, edges, 20);

  const layerFiles: Record<string, string[]> = {};
  for (const f of files) {
    (layerFiles[f.layer] ||= []).push(f.path);
  }

  onProgress?.("done", "Analysis complete");

  return {
    files,
    edges,
    patterns,
    securityIssues,
    health,
    stats,
    structureSummary: {
      file_list: files.map((f) => f.path),
      layers: layerFiles,
      top_files: top,
      languages,
      patterns,
      security: securityIssues.slice(0, 40),
      health,
      edges: edges.slice(0, 200),
    },
  };
}

export function getFileContent(analysis: CodeflowAnalysis, path: string): string | null {
  return analysis.files.find((f) => f.path === path)?.content ?? null;
}
