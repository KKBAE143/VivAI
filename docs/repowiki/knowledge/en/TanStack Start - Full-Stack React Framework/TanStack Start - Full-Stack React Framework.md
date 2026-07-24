---
kind: external_dependency
name: TanStack Start - Full-Stack React Framework
slug: tanstack-start
category: external_dependency
category_hints:
    - vendor_identity
    - framework_behavior
scope:
    - '**'
source_files:
    - package.json
    - vite.config.ts
    - src/router.tsx
---

Full-stack React framework combining TanStack Router, React Query, and server-side rendering. Frontend built with React 19, TypeScript, and Vite. Uses @tanstack/react-router for file-based routing, @tanstack/react-query for data fetching, and Nitro for serverless deployment to Cloudflare Pages/Workers. Server entry point configured in vite.config.ts with cloudflare-module preset.