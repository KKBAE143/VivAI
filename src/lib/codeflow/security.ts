/** Lightweight security heuristics (ported subset of CodeFlow detectSecurity). */

import type { CodeFile, SecurityIssue } from "./types";

function isTestPath(path: string): boolean {
  const l = path.toLowerCase();
  return l.includes("test") || l.includes("__tests__") || l.includes("spec.");
}

export function detectSecurity(files: CodeFile[]): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  for (const f of files) {
    if (!f.content) continue;
    const lines = f.content.split("\n");
    const scan = f.content;

    lines.forEach((line, idx) => {
      if (
        !isTestPath(f.path) &&
        /(?:password|passwd|pwd|secret|api_key|apikey|token|auth)\s*[=:]\s*['"][^'"]{4,}['"]/i.test(
          line,
        ) &&
        !line.includes("process.env") &&
        !line.includes("config.")
      ) {
        issues.push({
          severity: "high",
          title: "Hardcoded Secret",
          file: f.name,
          path: f.path,
          line: idx + 1,
          desc: "Credentials should never be hardcoded. Use environment variables or a secrets manager.",
          code: line.trim().slice(0, 80),
        });
      }
    });

    if (
      f.isCode &&
      (scan.match(/query\s*\(\s*['"`][^'"`]*\s*\+/) ||
        (/\$\{/.test(scan) &&
          /(?:SELECT|INSERT|UPDATE|DELETE)/i.test(scan) &&
          /\b(?:query|execute|raw)\s*\(/.test(scan)))
    ) {
      issues.push({
        severity: "high",
        title: "SQL Injection Risk",
        file: f.name,
        path: f.path,
        desc: "String concatenation in SQL-like queries. Prefer parameterized queries.",
        code: "",
      });
    }

    if (
      !isTestPath(f.path) &&
      (scan.includes("innerHTML") || scan.includes("dangerouslySetInnerHTML"))
    ) {
      issues.push({
        severity: "high",
        title: "XSS Vulnerability",
        file: f.name,
        path: f.path,
        desc: "Direct HTML injection can lead to XSS. Sanitize user input.",
      });
    }

    if (/\beval\s*\(/.test(scan)) {
      issues.push({
        severity: "high",
        title: "Dynamic Code Execution",
        file: f.name,
        path: f.path,
        desc: "eval() executes arbitrary code. Avoid or validate input strictly.",
      });
    }

    if (/\bexec\s*\(/.test(scan) && f.name.endsWith(".py")) {
      issues.push({
        severity: "high",
        title: "Python exec()",
        file: f.name,
        path: f.path,
        desc: "exec() executes arbitrary Python code.",
      });
    }

    if (/pickle\.load|subprocess\.\w+\([^)]*shell\s*=\s*True|\bos\.system\s*\(/.test(scan)) {
      issues.push({
        severity: "high",
        title: "Unsafe Runtime / Deserialization",
        file: f.name,
        path: f.path,
        desc: "Pickle, shell=True subprocess, or os.system can be dangerous with untrusted input.",
      });
    }

    if (/\bDEBUG\s*=\s*True\b/.test(scan)) {
      issues.push({
        severity: "medium",
        title: "Debug Mode Enabled",
        file: f.name,
        path: f.path,
        desc: "DEBUG = True found. Ensure this is disabled in production.",
      });
    }

    const todos = (scan.match(/TODO|FIXME|HACK|XXX/g) || []).length;
    if (todos > 0) {
      issues.push({
        severity: "low",
        title: "Code Comments",
        file: f.name,
        path: f.path,
        desc: `${todos} TODO/FIXME comments found. Address before release.`,
      });
    }

    const consoleCount = (scan.match(/console\.(log|debug|info)\(/g) || []).length;
    if (consoleCount > 3 && !isTestPath(f.path)) {
      issues.push({
        severity: "low",
        title: "Debug Statements",
        file: f.name,
        path: f.path,
        desc: `${consoleCount} console statements found. Remove before production.`,
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2, info: 3 } as const;
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
