/** Ported from CodeFlow IGNORE / exclude helpers. */

export const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "vendor",
  "dist",
  "build",
  "__pycache__",
  ".next",
  "coverage",
  ".venv",
  "venv",
  "env",
  ".env",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "__pypackages__",
  ".eggs",
  "__macosx",
]);

export const ANALYSIS_LIMITS = {
  localSoft: 500,
  maxFiles: 400,
  maxFileChars: 80_000,
  maxTotalChars: 2_000_000,
};

export function shouldSkipPath(path: string): boolean {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.some((p) => IGNORE_DIRS.has(p.toLowerCase()) || IGNORE_DIRS.has(p));
}
