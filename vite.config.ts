import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
// Lives outside src/ on purpose: it imports node:fs, and vite.config.ts is not
// part of any bundle graph, so importProtection never sees it.
import { diagnosticsPlugin } from "./tools/diagnostics-vite-plugin";

export default defineConfig(async ({ command }) => {
  const plugins = [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    react(),
    tailwindcss(),
    // `apply: "serve"` inside the plugin keeps it out of production builds.
    diagnosticsPlugin(),
  ];

  if (command === "build") {
    const effectiveApiUrl =
      process.env.VITE_API_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

    if (!effectiveApiUrl) {
      const message =
        "VITE_API_URL is not set. The production bundle would hard-code " +
        "http://localhost:8000 as the API endpoint and fail for every visitor. " +
        "Set VITE_API_URL to the deployed backend URL before building.";
      if (
        process.env.ALLOW_LOCALHOST_API_BUILD === "1" ||
        process.env.VERCEL ||
        process.env.CI
      ) {
        console.warn(`\n[build] WARNING: ${message}\n`);
      } else {
        throw new Error(
          `${message}\n(If you really want a localhost build — e.g. to inspect ` +
            `bundle output — re-run with ALLOW_LOCALHOST_API_BUILD=1.)`,
        );
      }
    }

    const { nitro } = await import("nitro/vite");
    plugins.push(
      nitro({
        defaultPreset: "cloudflare-module",
      }),
    );
  }

  return {
    plugins,
    define: {
      // Shared with the backend via start-app.ps1 so browser and server events
      // from the same launch carry the same run id.
      __DIAG_RUN_ID__: JSON.stringify(process.env.HORUX_RUN_ID ?? null),
    },
    css: {
      transformer: "lightningcss",
    },
    resolve: {
      alias: {
        "@": `${process.cwd()}/src`,
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    server: {
      host: "::",
      port: 8080,
    },
  };
});
