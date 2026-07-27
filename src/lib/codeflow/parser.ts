/** File classification + import extraction (CodeFlow regex path). */

import { layerForPath } from "./layers";
import type { CodeFile } from "./types";

const CODE_EXTS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".pyw",
  ".pyi",
  ".java",
  ".go",
  ".rb",
  ".php",
  ".rs",
  ".c",
  ".cpp",
  ".cc",
  ".h",
  ".hpp",
  ".cs",
  ".swift",
  ".kt",
  ".kts",
  ".scala",
  ".lua",
  ".sh",
  ".bash",
  ".sql",
  ".vue",
  ".svelte",
]);

const TEXT_EXTS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".graphql",
  ".gql",
  ".prisma",
  ".proto",
  ".env",
]);

const LANG_BY_EXT: Record<string, string> = {
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".py": "Python",
  ".pyw": "Python",
  ".pyi": "Python",
  ".java": "Java",
  ".go": "Go",
  ".rs": "Rust",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".sql": "SQL",
  ".css": "CSS",
  ".html": "HTML",
  ".md": "Markdown",
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function isCodeFile(name: string): boolean {
  return CODE_EXTS.has(extOf(name));
}

export function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (TEXT_EXTS.has(extOf(name))) return true;
  return ["dockerfile", "makefile", "license", "readme", "gemfile", "procfile"].includes(lower);
}

export function isIncluded(name: string): boolean {
  return isCodeFile(name) || isTextFile(name);
}

export function languageOf(name: string): string {
  return LANG_BY_EXT[extOf(name)] || "Other";
}

/** Extract import/require/from targets (best-effort). */
export function extractImports(content: string, filename: string): string[] {
  const imports = new Set<string>();
  const ext = extOf(filename);

  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte"].includes(ext)) {
    const re =
      /(?:import\s+(?:[\s\S]*?\s+from\s+)?|export\s+[\s\S]*?\s+from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) imports.add(m[1]);
  }

  if ([".py", ".pyw", ".pyi"].includes(ext)) {
    const fromRe = /^\s*from\s+([\w.]+)\s+import\s+/gm;
    const importRe = /^\s*import\s+([\w.,\s]+)/gm;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(content))) imports.add(m[1]);
    while ((m = importRe.exec(content))) {
      m[1].split(",").forEach((part) => {
        const mod = part
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (mod) imports.add(mod);
      });
    }
  }

  if (ext === ".java" || ext === ".kt" || ext === ".kts") {
    const re = /^\s*import\s+([\w.]+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) imports.add(m[1]);
  }

  if (ext === ".go") {
    const re = /import\s+(?:\(([\s\S]*?)\)|"([^"]+)")/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      if (m[2]) imports.add(m[2]);
      if (m[1]) {
        m[1].split("\n").forEach((line) => {
          const q = line.match(/"([^"]+)"/);
          if (q) imports.add(q[1]);
        });
      }
    }
  }

  return [...imports];
}

/** Resolve relative JS/TS imports to a path-like key when possible. */
export function resolveImportTarget(
  fromPath: string,
  spec: string,
  allPaths: Set<string>,
): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null;
  const fromDir = fromPath.replace(/\\/g, "/").split("/").slice(0, -1);
  const parts = spec.replace(/\\/g, "/").split("/");
  const stack = [...fromDir];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  const base = stack.join("/");
  const candidates = [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".js",
    base + ".jsx",
    base + "/index.ts",
    base + "/index.tsx",
    base + "/index.js",
    base + ".py",
    base + "/__init__.py",
  ];
  for (const c of candidates) {
    if (allPaths.has(c)) return c;
  }
  // Case-insensitive fallback
  const lowerMap = new Map([...allPaths].map((p) => [p.toLowerCase(), p]));
  for (const c of candidates) {
    const hit = lowerMap.get(c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

export function buildCodeFile(path: string, content: string): CodeFile {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const name = normalized.split("/").pop() || normalized;
  const folder = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
  const lines = content ? content.split("\n").length : 0;
  return {
    path: normalized,
    name,
    folder,
    content,
    lines,
    language: languageOf(name),
    layer: layerForPath(normalized),
    isCode: isCodeFile(name),
    imports: extractImports(content, name),
    importPaths: [],
  };
}
