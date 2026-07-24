---
kind: error_handling
name: 'Cross-Platform Error Handling: ASGI Middleware, ApiError, and Global Capture'
category: error_handling
scope:
    - '**'
source_files:
    - backend/core/errors.py
    - backend/main.py
    - src/lib/api.ts
    - src/lib/error-capture.ts
    - src/lib/error-page.ts
    - src/components/error-state.tsx
---

This monorepo implements a layered error-handling strategy that spans the FastAPI backend and the TanStack Start/React frontend, with explicit attention to CORS boundaries and unhandled exceptions.

### Backend (FastAPI / Starlette)
- **Global catch-all middleware**: `backend/core/errors.py` defines `CatchAllErrorMiddleware`, an ASGI middleware that wraps every HTTP request and converts any unhandled Python exception into a JSON `{"detail": ..., "request_id": ...}` 500 response. It is intentionally placed *before* `CORSMiddleware` in the middleware chain so that CORS headers are still attached to error responses — a deliberate architectural decision documented in the module docstring to avoid the browser blocking generic 500s.
- **Application wiring**: `backend/main.py` registers this middleware first, then adds `CORSMiddleware`, ensuring all routes benefit from the same error-shaping behavior without per-endpoint try/except blocks.
- **Structured logging**: The middleware logs every unhandled exception via `core.logging.get_logger("http")` with a generated `request_id` for correlation across services.
- **Domain errors**: Business logic raises standard Python exceptions (`ValueError`, `RuntimeError`) directly; there is no custom exception hierarchy beyond what the catch-all middleware normalizes.

### Frontend (TypeScript / React)
- **Centralized API client errors**: `src/lib/api.ts` defines a single `ApiError extends Error` class carrying both `status` and a human-readable `message`. All network failures (fetch rejections, non-JSON bodies, CORS-blocked server crashes) are funneled through this type, distinguishing between true network errors (status 0) and HTTP error responses.
- **Automatic token refresh on 401**: The `api()` wrapper intercepts 401 responses, performs a one-time silent refresh, retries once, and clears the session if the refresh fails — preventing cascading auth failures.
- **AbortSignal passthrough**: Genuine `AbortError`s are re-thrown so React Query can treat them as cancellations rather than failures.
- **Global error capture**: `src/lib/error-capture.ts` listens to `globalThis.error` and `unhandledrejection` events, storing the last captured error for up to 5 seconds so the server-side handler (`server.ts`) can recover stack traces even when h3 swallows throws into a generic 500.
- **User-facing error UI**: `src/components/error-state.tsx` provides a reusable `<ErrorState>` component with a message and retry callback; `src/lib/error-page.ts` renders a minimal static HTML fallback page for fatal load-time failures.
- **Deactivated third-party reporting**: `src/lib/lovable-error-reporting.ts` is a stub indicating Lovable error reporting was removed.

### Architecture & Conventions
- Errors flow upward: business code raises native exceptions → ASGI middleware serializes them → frontend `api()` wrapper converts HTTP responses into typed `ApiError` instances → components render `ErrorState` or trigger retry.
- No panics/recover pattern exists; Python uses structured exception raising, and JavaScript relies on try/catch plus global event listeners.
- Correlation IDs (`request_id` in backend, timestamped capture window in frontend) enable tracing across the full request lifecycle.