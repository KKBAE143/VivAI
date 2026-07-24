---
kind: dependency_management
name: Bun + pip dual-stack dependency management with lockfiles and release-age gating
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - bun.lock
    - bunfig.toml
    - backend/requirements.txt
    - backend/requirements-dev.txt
---

This repository is a full-stack monorepo that manages dependencies for two distinct runtime stacks — a Bun/TypeScript frontend (TanStack Start) and a Python FastAPI backend — using separate package managers, each with its own manifest and lockfile strategy.

### What system/approach is used
- **Frontend (Bun)**: Dependencies are declared in the root `package.json` under `dependencies` and `devDependencies`, and resolved via Bun's workspace resolver. A generated `bun.lock` file pins every transitive dependency to exact versions and checksums, providing deterministic installs across machines.
- **Backend (pip)**: Python packages are listed in `backend/requirements.txt` (runtime) and `backend/requirements-dev.txt` (test-only, which re-imports `requirements.txt`). The project does not use `pip-tools` / `pip-compile`, so there is no equivalent `.txt.lock` file; pinned versions come from the `>=` constraints in `requirements.txt`.
- **Workspace model**: There is only one top-level `package.json`; no `workspaces` array or sub-package manifests are present, so all frontend code shares a single dependency graph.

### Key files and packages
- `package.json` — declares all frontend runtime and dev dependencies (React 19, TanStack Router/Start/Query, Radix UI primitives, Tailwind v4, Vite 8, ESLint/Prettier tooling).
- `bun.lock` — Bun-generated lockfile (lockfileVersion 1) that records every installed package at exact version + sha512 integrity, including platform-specific `@esbuild/*` binaries.
- `bunfig.toml` — global Bun configuration enabling a supply-chain guard: `minimumReleaseAge = 86400` seconds (24 hours), preventing installation of packages published less than a day ago.
- `backend/requirements.txt` — runtime Python deps (FastAPI >=0.115, uvicorn, Supabase client, Pydantic v2, Google GenAI, httpx, websockets).
- `backend/requirements-dev.txt` — test-only layer that re-imports `requirements.txt` and adds pytest + pytest-asyncio.

### Architecture and conventions
- **Single-root frontend manifest**: All JS/TS packages live in one `package.json`; there are no per-feature or per-route sub-manifests, keeping the dependency surface flat and easy to audit.
- **Dev vs. runtime separation**: Frontend uses npm-style `devDependencies` for build/tooling (Vite, TypeScript, ESLint, Prettier); backend separates test-only tools into a dedicated `requirements-dev.txt` that explicitly includes `-r requirements.txt`.
- **Lockfile-first determinism**: Bun's `bun.lock` is committed alongside source, ensuring CI and local installs resolve to identical trees. No equivalent lockfile exists for Python; pinning relies on the `>=` lower bounds in `requirements.txt`.
- **Supply-chain safety gate**: The Bun install config enforces a 24-hour minimum publication age, blocking freshly released packages from being pulled in automatically.

### Conventions and constraints
- Frontend packages are pinned with caret ranges (`^`) in `package.json`, while Bun's lockfile resolves them to exact versions at install time.
- Backend Python packages use upper-bound-free lower bounds (`>=X.Y.Z`), meaning upgrades are allowed by default unless overridden locally or in CI.
- Test-only Python dependencies must be installed via `requirements-dev.txt`, which always re-imports the runtime set rather than duplicating entries.
- No vendoring directory (e.g., `vendor/`, `node_modules/` committed) is present; both stacks rely on remote registries plus their respective lockfiles.
- No private registry, token, or scoped-auth configuration is visible in the repo; installs target the public npm registry and PyPI.