---
kind: external_dependency
name: Cloudflare Pages/Workers - Deployment Platform
slug: cloudflare-pages-workers
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
source_files:
    - vite.config.ts
    - package.json
---

Target deployment platform for frontend via Nitro build system with cloudflare-module preset. Backend can deploy to any Python-compatible platform (Fly, Railway, Render, or self-hosted). Environment variables configured through .env files with separate configurations for development and production environments.