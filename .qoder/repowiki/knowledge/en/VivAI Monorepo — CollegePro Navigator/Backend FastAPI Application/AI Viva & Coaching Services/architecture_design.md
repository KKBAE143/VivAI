The module is organized as a set of focused service modules layered over a single Gemini client:
- `gemini_service.py` is the sole LLM/VLM gateway (google-genai), providing `generate_text`, `generate_json`, streaming, and image-augmented variants with retry logic and JSON extraction.
- `prompts.py` centralizes every system prompt and template used by the LLM calls; callers never embed raw prompts inline.
- `registry.py` owns all scenario definitions, personas, and rubric dimensions as frozen dataclasses, exposing only safe public fields to the frontend via `public_scenario`.
- `viva_core.py` implements the core viva flow: question generation, answer evaluation, hint generation, adaptive difficulty, and session summarization — all delegating to `gemini_service` and templated through `prompts`.
- `code_aware_viva.py` ingests a ZIP codebase, builds a compact digest, distills a knowledge pack via Gemini with a deterministic fallback (`deterministic_knowledge_pack`), validates/scrubs model output against real file paths, and renders an examiner-facing brief capped for free-tier limits.
- `report_service.py` constructs evidence-constrained reports from turns, observations, questions, and metrics, enforcing citation integrity via `_valid_evidence_refs` and recomputing weighted scores from the scenario's rubric.
- `sentiment_analyzer.py` analyzes webcam frames through Gemini VLM and emits threshold-based nudges over rolling windows.
- `delivery_metrics.py` computes filler-word usage, WPM, fluency, and clarity purely deterministically from transcripts/timing — no LLM call.
- `weakness_heatmap.py` aggregates per-topic performance across Supabase `viva_sessions`/`viva_questions` tables into heatmaps and topic histories.

Dependency direction is strictly inward: all services depend on `gemini_service` and `prompts`; `report_service` depends on `registry`; `weakness_heatmap` depends on `core.database`. No cross-imports between sibling service modules keep concerns isolated.