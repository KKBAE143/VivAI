---
kind: design
name: Institutional multi-tenancy via role + institution_id on profiles
source: session
category: adr
---

# Institutional multi-tenancy via role + institution_id on profiles

_Source: coding plans from commit period 02d068d → cf6f9d6 — records intent at planning time; the implementation may lag or differ._

**Status:** accepted

## Context
The product needs to support colleges/institutions as first-class tenants with admin dashboards, cohort analytics, and invite-based student onboarding — not just individual users.

## Decision drivers
- cohort-level analytics
- admin-only routes
- invite-based enrollment
- minimal schema changes

## Considered options
- **Dedicated `institutions` table with FK from `profiles.institution_id`** — pros: clean separation; supports multiple institutions per user later; cons: requires new tables and auth guard
- **Flat `college_name` grouping only** _(rejected)_ — pros: no schema change; cons: no seat limits, no admin roles, no institutional lifecycle

## Decision
Extend `profiles` with `role TEXT CHECK IN ('student','faculty','admin')` and `institution_id UUID`, add `institutions` (tier, seat_limit, pilot dates) and `institution_members` tables. Guard all `/api/institution/*` routes with a `require_admin` dependency checking role and institution membership.

## Consequences
Admin dashboard at `/admin/index.tsx` aggregates cohort stats, readiness heatmaps, and weak topics. Non-admins are redirected away from admin routes. Seat limits and tiering enable future paid tiers.