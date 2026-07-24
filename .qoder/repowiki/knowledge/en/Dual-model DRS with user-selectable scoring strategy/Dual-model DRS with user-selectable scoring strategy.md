---
kind: design
name: Dual-model DRS with user-selectable scoring strategy
source: session
category: adr
---

# Dual-model DRS with user-selectable scoring strategy

_Source: coding plans from commit period 02d068d → cf6f9d6 — records intent at planning time; the implementation may lag or differ._

**Status:** accepted

## Context
The existing DRS model (v1: viva/presentation/coverage/consistency/project) was being supplemented by a new 'Defense Readiness Score' (v2: Technical Depth 30%, Communication 25%, Coverage 20%, Confidence 15%, Structure 10%) that better reflects interview-style evaluation. Users should choose which model drives their score.

## Decision drivers
- backwards compatibility with existing scores
- user preference for scoring style
- peer benchmarking against college cohorts
- no new data collection required for benchmarks

## Considered options
- **Parallel v1 and v2 models with user choice persisted in `profiles.drs_model`** — pros: existing users keep v1; new users default to v2; both scores available; cons: doubles scoring logic; migration path needed
- **Single v2 model replacing v1 outright** _(rejected)_ — pros: simpler codebase; cons: breaks historical scores; no opt-out

## Decision
Keep `model_v1` in `readiness_service.py` and add `model_v2` using delivery metrics, response latency, and NLP heuristics. Persist user choice in `profiles.drs_model` (default v1 for existing, v2 for new). Expose `PUT /api/readiness/model` to switch. Compute peer percentiles from existing `viva_sessions` grouped by `college_name`.

## Consequences
Readiness page renders the selected model's dimensions and weights. Benchmarks show percentile vs. college/branch/year averages cached hourly. Users can toggle between Classic and Defense Readiness Score in profile settings.