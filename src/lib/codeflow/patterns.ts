/** Design pattern / anti-pattern detection (ported subset of CodeFlow). */

import type { CodeFile, PatternHit } from "./types";

export function detectPatterns(files: CodeFile[]): PatternHit[] {
  const patterns: PatternHit[] = [];
  const code = files.filter((f) => f.isCode);

  const push = (
    name: string,
    desc: string,
    matches: CodeFile[],
    severity: "info" | "warning" = "info",
    isAnti = false,
    metrics?: Record<string, number>,
  ) => {
    if (!matches.length) return;
    patterns.push({
      name,
      desc,
      severity,
      isAnti,
      files: matches.slice(0, 12).map((f) => ({ name: f.name, path: f.path, lines: f.lines })),
      metrics,
    });
  };

  push(
    "Singleton",
    "Ensures a class has only one instance. Common for configuration, logging, or connection pools.",
    code.filter(
      (f) =>
        f.content.includes("getInstance") ||
        /let\s+instance\s*=/.test(f.content) ||
        /private\s+static\s+instance/.test(f.content),
    ),
  );

  push(
    "Factory",
    "Creates objects without specifying exact class. Enables loose coupling and extensibility.",
    code.filter(
      (f) =>
        f.name.toLowerCase().includes("factory") ||
        /create[A-Z]\w*\s*\(/.test(f.content),
    ),
  );

  push(
    "Observer/Event",
    "Subscription mechanism for event-driven architecture.",
    code.filter(
      (f) =>
        f.content.includes("subscribe") ||
        f.content.includes("addEventListener") ||
        f.content.includes(".on(") ||
        f.content.includes("emit("),
    ),
  );

  push(
    "Custom Hooks",
    "React hooks for reusable stateful logic.",
    code.filter((f) => /export\s+(?:const|function)\s+use[A-Z]/.test(f.content)),
  );

  push(
    "Context Provider",
    "React Context for global state / dependency injection of UI state.",
    code.filter(
      (f) =>
        f.content.includes("createContext") ||
        f.content.includes("useContext") ||
        /Provider\b/.test(f.content),
    ),
  );

  push(
    "Route Decorators",
    "Flask/FastAPI/Django-style route decorators for URL routing.",
    code.filter(
      (f) =>
        f.name.endsWith(".py") &&
        /@(?:app\.route|router\.|blueprint\.|get|post|put|delete|patch)\s*\(/.test(f.content),
    ),
  );

  push(
    "Dataclasses",
    "Python dataclasses for structured data with less boilerplate.",
    code.filter((f) => f.name.endsWith(".py") && /@dataclass/.test(f.content)),
  );

  push(
    "Middleware",
    "Request/response middleware for cross-cutting concerns.",
    code.filter(
      (f) =>
        f.name.toLowerCase().includes("middleware") ||
        /class\s+\w*Middleware/.test(f.content),
    ),
  );

  const longFiles = code.filter((f) => f.lines > 500);
  push(
    "Long File",
    "Files over 500 lines are harder to maintain. Consider splitting into smaller modules.",
    longFiles,
    "warning",
    true,
    {
      files: longFiles.length,
      avgLines: longFiles.length
        ? Math.round(longFiles.reduce((s, f) => s + f.lines, 0) / longFiles.length)
        : 0,
    },
  );

  const dense = code.filter((f) => {
    const fnApprox = (f.content.match(/\b(?:function|def|const\s+\w+\s*=\s*(?:async\s*)?\()/g) || [])
      .length;
    return fnApprox > 15;
  });
  push(
    "God Object",
    "Files with too many responsibilities (many functions). Consider splitting.",
    dense,
    "warning",
    true,
    { files: dense.length },
  );

  return patterns;
}
