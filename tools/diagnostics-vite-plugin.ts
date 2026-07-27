/**
 * Dev-server middleware that persists frontend diagnostics to disk.
 *
 * Why a Vite plugin rather than a backend endpoint:
 *  - Same origin as the app, so no CORS, no preflight, no auth, and no new
 *    surface on the real API.
 *  - It keeps working when the backend is down — which is exactly the moment
 *    you most need the browser's side of the story.
 *  - `apply: "serve"` means it does not exist in a production build, so the
 *    `node:fs` import below never enters the client graph and the Cloudflare
 *    bundle is untouched. This file lives OUTSIDE `src/` for the same reason:
 *    vite.config.ts is not part of any bundle graph, so `importProtection`
 *    has nothing to complain about.
 *
 * This is also the second, INDEPENDENT redaction pass. It re-runs the full
 * pattern redactor (not just an env-literal substitution) because this endpoint
 * accepts a plain POST: the SSR path, a bug in the client reporter, or a direct
 * request would otherwise write verbatim. It then additionally substitutes the
 * literal values of secret-looking environment variables, which the browser
 * cannot see. A secret has to survive BOTH passes to reach disk.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
// The SAME redactor the browser uses. Pure, no DOM, no node imports.
import { redactObj } from "../src/diagnostics/redact";

const INGEST_PATH = "/__diag/ingest";
const MAX_BODY_BYTES = 512 * 1024;
const MAX_EVENTS_PER_BATCH = 100;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const RETENTION_DAYS = 7;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

const SECRET_ENV_RE = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|SIGNATURE|SALT)/i;
const MIN_ENV_LITERAL = 8;

function envLiterals(): [string, string][] {
  const out: [string, string][] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < MIN_ENV_LITERAL) continue;
    if (!SECRET_ENV_RE.test(name)) continue;
    if (/^https?:\/\//.test(value) && !value.includes("@")) continue;
    out.push([value, `[redacted:env:${name}]`]);
  }
  return out.sort((a, b) => b[0].length - a[0].length);
}

function scrubLiterals(text: string, literals: [string, string][]): string {
  let out = text;
  for (const [literal, replacement] of literals) {
    if (out.includes(literal)) out = out.split(literal).join(replacement);
  }
  return out;
}

function todayFile(dir: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return join(dir, `events-${day}.jsonl`);
}

function prune(dir: string): void {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      try {
        if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export function diagnosticsPlugin(options: { dir?: string } = {}): Plugin {
  const dir = join(options.dir ?? join(REPO_ROOT, "diagnostics"), "frontend");
  let literals: [string, string][] = [];
  let pruned = false;
  let seq = 0;

  function write(lines: string[]): void {
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      if (!pruned) {
        prune(dir);
        pruned = true;
      }
      const file = todayFile(dir);
      try {
        if (existsSync(file) && statSync(file).size > MAX_FILE_BYTES) unlinkSync(file);
      } catch {
        /* ignore */
      }
      appendFileSync(file, lines.join("\n") + "\n", "utf-8");
    } catch {
      // Never let a diagnostics write break the dev server.
    }
  }

  return {
    name: "horux-diagnostics",
    // Dev only. This entire plugin is absent from `vite build`.
    apply: "serve",

    configureServer(server: ViteDevServer) {
      literals = envLiterals();

      server.middlewares.use(INGEST_PATH, (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            res.statusCode = 413;
            res.end();
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", () => {
          try {
            const batch = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            const events = Array.isArray(batch?.events)
              ? batch.events.slice(0, MAX_EVENTS_PER_BATCH)
              : [];
            // Redact HERE as well as in the browser. The client scrubs before
            // sending, but this endpoint accepts a plain POST — anything that
            // bypasses client.ts (the SSR path, a bug in the reporter, or a
            // direct request) would otherwise land on disk verbatim. A secret
            // must fail BOTH stages to be written, not just the first.
            const lines = events.map((event: Record<string, unknown>) =>
              scrubLiterals(
                JSON.stringify({ ...(redactObj(event) as object), seq: ++seq }),
                literals,
              ),
            );
            if (batch?.dropped) {
              lines.push(
                JSON.stringify({
                  v: 1,
                  ts: new Date().toISOString(),
                  seq: ++seq,
                  source: "frontend",
                  kind: "aggregated",
                  level: "WARNING",
                  message: `${batch.dropped} diagnostic events were dropped by the client queue`,
                  run_id: batch.run_id ?? null,
                  session_id: batch.session_id ?? null,
                  fingerprint: "client-queue-overflow",
                }),
              );
            }
            if (lines.length) write(lines);
          } catch {
            /* a malformed batch is not worth a 500 */
          }
          res.statusCode = 204;
          res.end();
        });
      });
    },

    /**
     * Compile errors never reach the browser's error handlers — Vite shows an
     * overlay and the module simply never loads. Capturing them here is the
     * only way a build failure lands in the report.
     */
    buildEnd(error?: Error) {
      if (!error) return;
      write([
        scrubLiterals(
          JSON.stringify({
            v: 1,
            ts: new Date().toISOString(),
            seq: ++seq,
            source: "vite",
            kind: "build_error",
            level: "ERROR",
            message: error.message,
            run_id: process.env.HORUX_RUN_ID ?? null,
            session_id: null,
            fingerprint: `build-${error.name}`,
            error: { type: error.name || "BuildError", message: error.message, stack: error.stack },
          }),
          literals,
        ),
      ]);
    },
  };
}

export default diagnosticsPlugin;
