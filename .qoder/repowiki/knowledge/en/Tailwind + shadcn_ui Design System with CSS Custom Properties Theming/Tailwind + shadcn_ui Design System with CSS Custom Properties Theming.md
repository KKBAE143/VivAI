---
kind: frontend_style
name: Tailwind + shadcn/ui Design System with CSS Custom Properties Theming
category: frontend_style
scope:
    - '**'
source_files:
    - src/styles.css
    - components.json
    - src/lib/theme.tsx
    - src/lib/utils.ts
    - src/components/ui/button.tsx
    - package.json
---

The frontend uses a Tailwind CSS v4 design system built on top of shadcn/ui primitives, with theming driven by CSS custom properties and oklch color values. The approach combines utility-first styling (Tailwind), unstyled accessible primitives (Radix UI via shadcn/ui), and a centralized theme layer.

**Styling framework and toolchain**
- Tailwind CSS v4 is the core styling engine, imported via `@import "tailwindcss" source(none)` in `src/styles.css` with `@source "../src"` for content scanning.
- shadcn/ui is configured through `components.json` using the "new-york" style, TypeScript, CSS variables, and Lucide icons. Components live under `src/components/ui/` and are generated/shipped as individual files.
- Radix UI primitives power accessibility (dialogs, menus, tabs, etc.), while class composition uses `class-variance-authority` (cva) for variant-driven styles and `clsx` + `tailwind-merge` via a shared `cn()` helper in `src/lib/utils.ts`.
- Animation utilities come from `tw-animate-css`, and a custom audio equalizer animation (`viv-eq`) is defined inline in `styles.css`.

**Design tokens and theming**
- All colors are defined as CSS custom properties in `:root` and `.dark` blocks using oklch color space, enforcing perceptual uniformity across light/dark modes.
- A `@theme inline` block maps these CSS variables to Tailwind semantic tokens (e.g., `--color-primary`, `--color-background`, chart colors, sidebar palette).
- Radius tokens are derived from a single `--radius` base variable, producing `--radius-sm` through `--radius-4xl`.
- Theme switching is handled by a React `ThemeProvider` in `src/lib/theme.tsx` that toggles a `dark` class on `<html>` and persists the choice in `localStorage` under the key `cpn_theme`, falling back to `prefers-color-scheme`.

**Component conventions**
- Every shadcn/ui component follows the same pattern: a `cva`-defined variant map (e.g., `buttonVariants`, `alertVariants`, `badgeVariants`), a forwardRef'd React component, and className merging through `cn(...)`.
- Variant props include `variant` and `size` with sensible defaults; components accept an optional `asChild` prop to render as a Radix primitive via `@radix-ui/react-slot`.
- Feature-specific components live under `src/components/` (e.g., `code-aware/`, `live/`, `projects/`, `reports/`, `tasks/`) and compose the `ui/` primitives rather than duplicating styles.

**Responsive and accessibility strategy**
- Responsive behavior uses Tailwind's default breakpoint scale; no custom breakpoints are declared.
- Reduced-motion preferences are respected via `@media (prefers-reduced-motion: reduce)` for the audio visualizer.
- Base resets apply border colors and body background/foreground from design tokens in `@layer base`.

**Key files**
- `src/styles.css` — Tailwind entry, design tokens, dark mode, animations
- `components.json` — shadcn/ui configuration (style, aliases, icon library)
- `src/lib/theme.tsx` — ThemeProvider and useTheme hook
- `src/lib/utils.ts` — `cn()` class merger
- `src/components/ui/button.tsx` — canonical example of cva + shadcn pattern
- `package.json` — dependency declarations (Tailwind v4, shadcn/ui ecosystem, Radix, clsx, tailwind-merge)