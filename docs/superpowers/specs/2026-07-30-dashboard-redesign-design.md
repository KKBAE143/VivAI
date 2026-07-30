# Dashboard Redesign — Design Spec

**Date:** 2026-07-30
**Status:** Approved (self-reviewed)
**Scope:** Student dashboard at `/` (`src/routes/index.tsx`). Faculty (`/faculty`) and admin (`/admin`) dashboards are out of scope.

---

## 1. Problem

The current dashboard reads as clumsy, generic, and unaligned:

1. **No hierarchy.** Seven sections (greeting, readiness hero, gamification strip, 4 stat cards, projects+deadlines grid, quick-prep+sessions column, teams) all render as uniformly-sized white cards at similar visual weight. Nothing tells the eye where to go first.
2. **The hero is three awkward columns.** Gauge + readiness components grid + two CTA buttons compete inside one card; on medium screens the components grid wraps awkwardly and the buttons shrink.
3. **Generic styling.** Every section is the same `rounded-2xl bg-card` white box with the same orange accent — the "template SaaS" look the user flagged.
4. **Content doesn't answer "what do I do next?"** The readiness `actions[0]` exists in the data but is treated as a secondary button, not the page's answer.

## 2. Decision: Command Hero (Option B)

The dashboard is redesigned around a **Command Hero**: a single dominant visual unit at the top that fuses readiness state + primary next action + ambient glances (next deadline, streak, recent session count). Everything below is demoted into a clear secondary structure.

Rejected alternatives:
- **Statement hero (A):** Most beautiful, but pushes deadlines and sessions below the fold — betrays the command-center job.
- **Bento cluster (C):** Equal-weight competing tiles — the current disease in fancier packaging.

## 3. Target Audience & Jobs

Students. The page must serve three jobs in priority order:

1. **Coach** (primary): Show readiness state and the single best next action.
2. **Command center** (secondary): Projects, deadlines, pending work at a glance.
3. **Motivator** (tertiary): Streak, level, achievements — present but ambient, not competing.

## 4. Page Structure (top to bottom)

```
┌──────────────────────────────────────────────────────────┐
│ Greeting: "Good evening, Name" + one-line subtext        │
├──────────────────────────────────────────────────────────┤
│ COMMAND HERO (full-width, dominant)                      │
│ ┌────────────┬───────────────────────────┬─────────────┐ │
│ │ Readiness  │ Next action headline +    │ Glances:    │ │
│ │ gauge      │ primary CTA button        │ deadline,   │ │
│ │ (large)    │ + secondary action        │ streak, XP  │ │
│ └────────────┴───────────────────────────┴─────────────┘ │
├──────────────────────────────────────────────────────────┤
│ SECONDARY GRID (2 columns, left wide / right narrow)     │
│ ┌──────────────────────────┬───────────────────────────┐ │
│ │ Active Projects (cards)  │ Upcoming Deadlines        │ │
│ ├──────────────────────────┼───────────────────────────┤ │
│ │ Your Teams               │ Recent Sessions           │ │
│ └──────────────────────────┴───────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Key changes vs. current:
- **StatRow deleted.** Its four numbers (active projects, avg progress, pending tasks, sessions) are redundant: project count/progress is visible in the projects section; session count moves into the hero glance; pending tasks moves into the deadlines card header as a count badge.
- **GamificationStrip deleted as a standalone row.** Streak + level fold into the hero's glance column. (The strip component mini-bars duplicated the readiness component bars.)
- **QuickPrep card deleted.** Its three buttons duplicated the hero CTAs and AI tools entry; the hero owns "start practice" now.
- **Teams moves into the secondary grid** (was full-width at the bottom — the weakest content had the widest slot).

## 5. Component Design

### 5.1 CommandHero (new, in `src/routes/index.tsx` or `src/components/dashboard/command-hero.tsx`)

Three-zone layout, one card, asymmetric internal columns:

- **Zone 1 — Gauge (left):** `ReadinessGauge` at increased size (~160px), band-colored. Under it: the readiness `label` as the page's headline statement (e.g., "You’re almost viva-ready"), and a "Full breakdown →" link to `/readiness`.
- **Zone 2 — Next action (center, widest):** The readiness `actions[0]` rendered as the hero's *headline answer*: action `text` as a strong sentence, action `cta` as the dominant primary button (large, full orange). If `actions[1]` exists, a secondary outline button beside it. If no actions, default to "Start Mock Viva" primary + "Practice Presentation" secondary.
- **Zone 3 — Glances (right, narrow, stacked rows, separated by hairlines):**
  - Next deadline: date chip + project title + "in N days" (from projects with nearest future deadline)
  - Streak: flame icon + "N day streak" (from `useGamification`)
  - Level/XP: "Level N — X XP" with thin progress bar to next level
  - Sessions: "N practice sessions" with avg viva score if present

**Responsiveness:** desktop = 3 zones in one row; tablet = gauge+action row, glances row below; mobile = stacked single column, glances become a 2×2 mini-grid.

**Visual identity:** The hero card diverges from the generic white card — subtle warm gradient (primary-soft → card) background, no border, generous padding (p-8), the only place orange is used as ambient fill rather than accent. Everything below stays on clean white cards so the hero reads as *the* focal surface.

### 5.2 Secondary sections (refactor of existing components)

- **ActiveProjectsCard:** unchanged logic; denser card layout (progress bar height reduced, consistent 12-col internal grid so cards align).
- **UpcomingDeadlinesCard:** gains a pending-tasks count badge in its header (absorbing StatRow's one non-redundant number).
- **YourTeamsCard:** condensed to fit half-width; max 2 team tiles + create tile.
- **RecentSessionsCard:** unchanged logic, minor density/typography alignment.

### 5.3 Spacing & grid contract

- Page uses the AppShell container; vertical rhythm = `space-y-6` between sections (one scale only — current code mixes gap-3/4/5).
- Secondary grid: `lg:grid-cols-[2fr_1fr]` (wide/narrow) instead of equal thirds.
- One radius scale (`rounded-2xl` cards, `rounded-xl` inner elements), one shadow (`--shadow-card`), oklch tokens only — per existing styles.css conventions.

### 5.4 Dark mode

Hero gradient uses token-based colors (`primary-soft`→`card`), so dark mode inherits correctly without overrides. Verify glaze/contrast in `.dark` (existing tokens already define both).

## 6. Data Flow

No new endpoints. Existing hooks, unchanged:
- `useReadiness()` → hero zones 1–2 (+ weak count if needed)
- `useProjects()` → hero glance (next deadline) + ActiveProjects + Deadlines
- `useGamification()` → hero glance (streak, level/XP)
- `useDashboard()` → deadlines card header badge (pending_tasks), hero glance (sessions count, avg_viva_score)
- `useVivaSessions()` → RecentSessions
- `useTeams()`, `useMe()` → Teams

The `useDashboard` stat tiles dependency shrinks — after refactor, `active_projects`/`avg_progress` are no longer fetched for display, but the hook stays (pending_tasks still used); no backend change.

## 7. Files Changed

- `src/routes/index.tsx` — restructured page (hero replaces ReadinessHero+GamificationStrip+StatRow+QuickPrep)
- `src/components/dashboard/command-hero.tsx` — **new** component (keeps index.tsx readable; hero is self-contained)
- `src/components/readiness-gauge.tsx` — accept larger size only via props (no change needed if props suffice)
- `src/components/gamification-strip.tsx` — **kept** (verified: still imported by `src/routes/progress.tsx`); only its usage on the dashboard is removed
- No changes to `styles.css` tokens, backend, or other routes.

## 8. Error / Empty / Loading States

- **Loading:** existing `DashboardSkeleton` retained (shape updated to match new layout — hero block + 2-col grid).
- **Error:** existing `ErrorState` retained.
- **Empty states preserved:** no projects / no deadlines / no sessions messages stay; empty dashboard (new user) still shows hero with default score-0 gauge and "Start Mock Viva" CTA.
- **Partial failure:** if `useGamification` fails but others succeed, glance column renders without streak row (each glance row guards its own data; no whole-page error for a glance-only failure).

## 9. Testing

- Update/extend component tests if any exist for dashboard (check `src/components/__tests__`); at minimum:
  - CommandHero renders action CTA from `actions[0]`, falls back to default when no actions.
  - Glance column hides streak row when gamification data absent.
  - `daysUntil` logic unchanged (pure function, already correct).
- Visual verification across breakpoints (mobile 375px, tablet 768px, desktop 1440px) and both themes — manual via dev server.
- Existing navigation: all Links preserved (start viva, presentation, readiness breakdown, projects, sessions, teams).

## 10. Non-Goals (YAGNI)

- No new data visualization (charts, trends) on the dashboard.
- No drag-to-rearrange personalization.
- No changes to AppShell navigation, faculty/admin pages, or the design token system.
- No animation beyond existing hover transitions (page should feel instant, not animated).

## 11. Success Criteria

- A first-time viewer can identify the readiness state and the next action in under 2 seconds.
- The page has exactly one dominant visual surface (the hero); all other cards are visually subordinate.
- No duplicated content: each fact (session count, streak, pending tasks) appears exactly once.
- Layout aligns on the container grid at all breakpoints; no orphan full-width sections below the grid.
