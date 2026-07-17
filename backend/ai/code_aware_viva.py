"""Code-Aware Viva: ZIP extract, knowledge pack distillation, live brief rendering.

Live never receives raw multi-file source. Free-tier safe: 0–2 non-live Gemini
calls max, hard char caps, deterministic fallback from structure summary.
"""
from __future__ import annotations

import io
import json
import zipfile

from ai import gemini_service, prompts

SOURCE_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".h", ".cs",
    ".go", ".rs", ".rb", ".php", ".sql", ".html", ".css", ".ipynb", ".kt", ".swift",
    ".vue", ".svelte", ".mjs", ".cjs",
}
SKIP_DIRS = {
    "node_modules", ".git", "venv", "__pycache__", "dist", "build", ".next",
    ".venv", "coverage", "vendor",
}
MAX_FILE_CHARS = 6000
MAX_TOTAL_CHARS = 60000
# Live rendered brief hard ceiling (plus playbook elsewhere).
LIVE_BRIEF_MAX_CHARS = 4500
DISTILL_INPUT_MAX = 36000
DISTILL_FILE_CHARS = 2500
DISTILL_TOP_N = 18


def extract_source_files(zip_bytes: bytes) -> dict[str, str]:
    """Return {path: content} for source files inside a ZIP, size-capped."""
    files: dict[str, str] = {}
    total = 0
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        # Strip single archive root folder if present.
        names = [i.filename for i in zf.infolist() if not i.is_dir()]
        root_prefix = _archive_root_prefix(names)
        for info in zf.infolist():
            if info.is_dir():
                continue
            path = info.filename
            if root_prefix and path.startswith(root_prefix):
                path = path[len(root_prefix):]
            path = path.replace("\\", "/").lstrip("/")
            if not path:
                continue
            parts = path.split("/")
            if any(p in SKIP_DIRS for p in parts):
                continue
            if not any(path.lower().endswith(ext) for ext in SOURCE_EXTENSIONS):
                continue
            try:
                content = zf.read(info).decode("utf-8", errors="ignore")[:MAX_FILE_CHARS]
            except Exception:
                continue
            if total + len(content) > MAX_TOTAL_CHARS:
                break
            files[path] = content
            total += len(content)
    return files


def _archive_root_prefix(names: list[str]) -> str:
    tops = set()
    for n in names:
        n = n.replace("\\", "/")
        if not n or n.endswith("/"):
            continue
        tops.add(n.split("/")[0])
    if len(tops) == 1:
        root = next(iter(tops))
        return root + "/"
    return ""


def build_digest(files: dict[str, str], max_chars: int = MAX_TOTAL_CHARS) -> str:
    parts = [f"### FILE: {path}\n{content}" for path, content in files.items()]
    return "\n\n".join(parts)[:max_chars]


def select_top_files(files: dict[str, str], structure: dict | None, limit: int = DISTILL_TOP_N) -> list[str]:
    """Prefer client CodeFlow top_files, then path heuristics."""
    ordered: list[str] = []
    if structure:
        for p in structure.get("top_files") or []:
            if p in files and p not in ordered:
                ordered.append(p)
        for p in structure.get("file_list") or []:
            if p in files and p not in ordered:
                ordered.append(p)
    # Prefer entry-ish names
    rest = sorted(
        files.keys(),
        key=lambda p: (
            0 if any(x in p.lower() for x in ("main.", "app.", "index.", "server.", "route")) else 1,
            -len(files[p]),
            p,
        ),
    )
    for p in rest:
        if p not in ordered:
            ordered.append(p)
    return ordered[:limit]


def build_distill_digest(files: dict[str, str], structure: dict | None) -> str:
    paths = select_top_files(files, structure)
    chunks: list[str] = []
    total = 0
    for p in paths:
        body = files[p][:DISTILL_FILE_CHARS]
        block = f"### FILE: {p}\n{body}"
        if total + len(block) > DISTILL_INPUT_MAX:
            break
        chunks.append(block)
        total += len(block)
    structure_note = ""
    if structure:
        structure_note = (
            "STRUCTURE SUMMARY (from local analyzer — treat paths as ground truth):\n"
            + json.dumps(
                {
                    "languages": structure.get("languages"),
                    "health": structure.get("health"),
                    "top_files": structure.get("top_files"),
                    "patterns": [
                        {"name": p.get("name"), "isAnti": p.get("isAnti"), "files": [f.get("path") for f in (p.get("files") or [])[:4]]}
                        for p in (structure.get("patterns") or [])[:12]
                    ],
                    "security": [
                        {"title": s.get("title"), "severity": s.get("severity"), "path": s.get("path")}
                        for s in (structure.get("security") or [])[:15]
                    ],
                },
                default=str,
            )[:8000]
            + "\n\n"
        )
    return (structure_note + "\n\n".join(chunks))[:DISTILL_INPUT_MAX]


def _existing_paths(files: dict[str, str], structure: dict | None) -> set[str]:
    paths = set(files.keys())
    if structure:
        for p in structure.get("file_list") or []:
            paths.add(str(p))
    return paths


def _filter_paths(paths: list | None, valid: set[str]) -> list[str]:
    out: list[str] = []
    for p in paths or []:
        s = str(p).strip().replace("\\", "/")
        if s in valid and s not in out:
            out.append(s)
        else:
            # Allow basename soft-match once
            base = s.split("/")[-1]
            for v in valid:
                if v.endswith("/" + base) or v == base:
                    if v not in out:
                        out.append(v)
                    break
    return out


def validate_knowledge_pack(pack: dict, files: dict[str, str], structure: dict | None) -> dict:
    """Drop invented paths; clamp sizes."""
    valid = _existing_paths(files, structure)
    pack = dict(pack or {})

    modules = []
    for m in (pack.get("modules") or [])[:10]:
        if not isinstance(m, dict):
            continue
        modules.append({
            "name": str(m.get("name") or "Module")[:80],
            "role": str(m.get("role") or "")[:400],
            "key_files": _filter_paths(m.get("key_files"), valid)[:6],
            "how_it_works": str(m.get("how_it_works") or "")[:500],
            "risks": [str(r)[:200] for r in (m.get("risks") or [])[:4]],
        })
    pack["modules"] = modules

    crit = []
    for c in (pack.get("critical_paths") or [])[:8]:
        if not isinstance(c, dict):
            continue
        crit.append({
            "flow": str(c.get("flow") or "")[:200],
            "files": _filter_paths(c.get("files"), valid)[:6],
            "what_to_probe": str(c.get("what_to_probe") or "")[:300],
        })
    pack["critical_paths"] = crit

    decisions = []
    for d in (pack.get("design_decisions") or [])[:8]:
        if not isinstance(d, dict):
            continue
        decisions.append({
            "decision": str(d.get("decision") or "")[:200],
            "why_likely": str(d.get("why_likely") or "")[:300],
            "challenge_question": str(d.get("challenge_question") or "")[:300],
        })
    pack["design_decisions"] = decisions

    weak = []
    for w in (pack.get("weak_spots") or [])[:8]:
        if not isinstance(w, dict):
            continue
        weak.append({
            "area": str(w.get("area") or "")[:120],
            "evidence": str(w.get("evidence") or "")[:200],
            "viva_angle": str(w.get("viva_angle") or "")[:300],
        })
    pack["weak_spots"] = weak

    plan = []
    for q in (pack.get("viva_plan") or [])[:8]:
        if not isinstance(q, dict):
            continue
        targets = _filter_paths(q.get("targets"), valid)
        plan.append({
            "q": str(q.get("q") or "")[:280],
            "targets": targets[:4],
            "difficulty": str(q.get("difficulty") or "Medium")[:20],
            "expected_points": [str(p)[:120] for p in (q.get("expected_points") or [])[:4]],
        })
    pack["viva_plan"] = [p for p in plan if p["q"]]

    pack["project_one_liner"] = str(pack.get("project_one_liner") or "")[:220]
    pack["architecture"] = str(pack.get("architecture") or "")[:900]
    pack["data_model"] = str(pack.get("data_model") or "")[:400]
    pack["stack"] = [str(s)[:40] for s in (pack.get("stack") or [])[:12]]
    pack["apis_or_entrypoints"] = [str(s)[:120] for s in (pack.get("apis_or_entrypoints") or [])[:10]]
    pack["security_and_quality"] = [str(s)[:200] for s in (pack.get("security_and_quality") or [])[:8]]
    pack["glossary"] = [
        {
            "term": str(g.get("term") or "")[:60],
            "meaning_in_this_repo": str(g.get("meaning_in_this_repo") or "")[:200],
        }
        for g in (pack.get("glossary") or [])[:10]
        if isinstance(g, dict)
    ]
    features = []
    for f in (pack.get("features") or [])[:10]:
        if not isinstance(f, dict):
            continue
        features.append({
            "name": str(f.get("name") or "")[:80],
            "what_it_does": str(f.get("what_it_does") or "")[:220],
            "how_implemented": str(f.get("how_implemented") or "")[:280],
            "key_files": _filter_paths(f.get("key_files"), valid)[:5],
        })
    pack["features"] = [f for f in features if f["name"]]
    # Soften any plan questions that still look like path trivia.
    cleaned_plan = []
    for q in pack.get("viva_plan") or []:
        text = str(q.get("q") or "")
        if "/" in text and any(ext in text for ext in (".ts", ".tsx", ".js", ".py", ".java", ".go")):
            # Rewrite path-trivia into a feature question; keep targets private.
            cleaned_plan.append({
                **q,
                "q": "Walk me through one core feature you implemented and how it works end to end.",
            })
        else:
            cleaned_plan.append(q)
    pack["viva_plan"] = cleaned_plan
    pack["source"] = pack.get("source") or "gemini"
    return pack


def deterministic_knowledge_pack(files: dict[str, str], structure: dict | None) -> dict:
    """Fallback when Gemini free tier fails — still grounded in real paths."""
    top = select_top_files(files, structure, 10)
    langs = (structure or {}).get("languages") or {}
    stack = list(langs.keys())[:8] if langs else []
    security = (structure or {}).get("security") or []
    patterns = (structure or {}).get("patterns") or []
    layers = (structure or {}).get("layers") or {}

    modules = []
    for layer, paths in list(layers.items())[:6]:
        real = [p for p in (paths or []) if p in files][:5]
        if not real:
            continue
        modules.append({
            "name": str(layer).title(),
            "role": f"{layer} layer in this codebase",
            "key_files": real,
            "how_it_works": f"Contains {len(real)} key file(s) including {real[0]}.",
            "risks": [],
        })
    if not modules and top:
        modules = [{
            "name": "Core",
            "role": "Primary application code",
            "key_files": top[:5],
            "how_it_works": "Main implementation modules of the student project.",
            "risks": [],
        }]

    weak = []
    for s in security[:5]:
        if not isinstance(s, dict):
            continue
        weak.append({
            "area": s.get("title") or "Quality",
            "evidence": s.get("path") or "",
            "viva_angle": s.get("desc") or "Explain how you mitigate this risk.",
        })

    # Feature-first viva plan — never "what does this long path do?"
    plan = [
        {
            "q": "First, in simple words — what is this project, who is it for, and what problem does it solve?",
            "targets": top[:2],
            "difficulty": "Easy",
            "expected_points": ["problem", "users", "main outcome"],
        },
        {
            "q": "What are the main features a user can do in your project? Walk me through one important user flow end to end.",
            "targets": top[:4],
            "difficulty": "Easy",
            "expected_points": ["2-4 features", "one flow start to finish"],
        },
        {
            "q": "Pick one core feature you implemented. How does it work from the UI or client through to the backend or data layer?",
            "targets": top[:3],
            "difficulty": "Medium",
            "expected_points": ["request path", "where state lives", "your role in building it"],
        },
        {
            "q": "How do you handle authentication or authorization in this project, if any? If not, how would a protected action work?",
            "targets": [p for p in top if any(k in p.lower() for k in ("auth", "guard", "jwt", "session", "login"))][:3] or top[:2],
            "difficulty": "Medium",
            "expected_points": ["login/session/token idea", "where checks happen"],
        },
        {
            "q": "Where is important data stored, and how does a create or update flow reach the database or API?",
            "targets": [p for p in top if any(k in p.lower() for k in ("model", "schema", "repo", "entity", "db", "prisma", "mongo"))][:3] or top[:2],
            "difficulty": "Medium",
            "expected_points": ["storage", "write path"],
        },
        {
            "q": "What was a hard technical decision you made while building this, and what alternative did you consider?",
            "targets": top[:2],
            "difficulty": "Medium",
            "expected_points": ["decision", "trade-off"],
        },
        {
            "q": "If something fails — bad input, API error, or network issue — how does your project handle it?",
            "targets": top[:3],
            "difficulty": "Hard",
            "expected_points": ["error path", "user-facing behavior"],
        },
    ]
    for pat in patterns[:2]:
        if not isinstance(pat, dict):
            continue
        name = pat.get("name") or "pattern"
        fps = [f.get("path") for f in (pat.get("files") or []) if isinstance(f, dict) and f.get("path")]
        fps = [p for p in fps if p in files][:2]
        plan.append({
            "q": f"Your project seems to use a {name} style approach in places — for which feature did you need that, and why?",
            "targets": fps,
            "difficulty": "Medium",
            "expected_points": ["which feature", "why that approach"],
        })

    arch_bits = []
    if layers:
        arch_bits.append("Layers present: " + ", ".join(f"{k}({len(v or [])})" for k, v in layers.items() if v))
    if top:
        arch_bits.append("Central files include: " + ", ".join(top[:6]))
    health = (structure or {}).get("health") or {}
    if health:
        arch_bits.append(f"Local structure health: {health.get('grade')} ({health.get('score')}/100).")

    return validate_knowledge_pack(
        {
            "project_one_liner": "Student project codebase prepared for a code-aware viva.",
            "stack": stack,
            "architecture": " ".join(arch_bits) or "Multi-file student project.",
            "modules": modules,
            "critical_paths": [{"flow": "Core application flow", "files": top[:4], "what_to_probe": "End-to-end request or UI flow"}],
            "design_decisions": [],
            "data_model": "",
            "apis_or_entrypoints": top[:5],
            "weak_spots": weak,
            "security_and_quality": [
                f"{s.get('severity')}: {s.get('title')} @ {s.get('path')}"
                for s in security[:6]
                if isinstance(s, dict)
            ],
            "glossary": [],
            "viva_plan": plan[:8],
            "source": "deterministic",
        },
        files,
        structure,
    )


def build_knowledge_pack(files: dict[str, str], structure: dict | None = None) -> dict:
    """Distill codebase into a compact semantic pack (max 2 Gemini attempts conceptually = 1 call)."""
    if not files:
        return deterministic_knowledge_pack({}, structure)

    digest = build_distill_digest(files, structure)
    try:
        raw = gemini_service.generate_json(
            prompts.CODE_KNOWLEDGE_PACK.format(digest=digest),
            prompts.VIVA_EXAMINER,
            default={},
        )
    except Exception:
        raw = {}

    if not isinstance(raw, dict) or not raw:
        return deterministic_knowledge_pack(files, structure)

    pack = validate_knowledge_pack(raw, files, structure)
    # Ensure we always have a viva plan
    if not pack.get("viva_plan"):
        fallback = deterministic_knowledge_pack(files, structure)
        pack["viva_plan"] = fallback["viva_plan"]
        pack["source"] = "gemini+fallback_plan"
    else:
        pack["source"] = "gemini"
    # Merge static security into security_and_quality if thin
    if structure and len(pack.get("security_and_quality") or []) < 2:
        for s in (structure.get("security") or [])[:5]:
            if isinstance(s, dict):
                pack.setdefault("security_and_quality", []).append(
                    f"{s.get('severity')}: {s.get('title')} @ {s.get('path')}"
                )
    return pack


def render_pack_for_live(pack: dict, max_chars: int = LIVE_BRIEF_MAX_CHARS) -> str:
    """Compact examiner-facing brief. Hard-capped for free-tier Live."""
    pack = pack or {}
    lines: list[str] = [
        "CODEBASE KNOWLEDGE PACK — YOUR PRIVATE NOTES (student cannot see this).",
        "Do NOT invent features that are not listed.",
        "",
        "HOW TO EXAMINE (mandatory):",
        "- Students do NOT memorize thousands of file paths. NEVER open with "
        "  'what does apps/.../file.ts do?' or read raw paths aloud.",
        "- Start high-level: what is the project, users, problem, main features.",
        "- Then ask about FEATURES and FLOWS: how login works, how a key feature is implemented, "
        "  how data moves, how errors are handled.",
        "- After each answer, SILENTLY check the notes below. If the student contradicts the codebase "
        "  (wrong stack, invented module, wrong flow), CROSS-QUESTION gently: "
        "  'You said X — in your project I would expect Y; can you walk me through that again?'",
        "- You may mention a module/feature by name; only mention a short filename if the student "
        "  already named it or you need a precise follow-up — never long monorepo paths.",
        "- Prefer: 'How does authentication work in your app?' over path trivia.",
        "",
    ]
    if pack.get("project_one_liner"):
        lines.append(f"PRODUCT: {pack['project_one_liner']}")
    if pack.get("stack"):
        lines.append("STACK: " + ", ".join(pack["stack"]))
    if pack.get("architecture"):
        lines.append(f"ARCHITECTURE: {pack['architecture']}")
    if pack.get("data_model"):
        lines.append(f"DATA: {pack['data_model']}")

    features = pack.get("features") or []
    if features:
        lines.append("FEATURES (prefer asking about these):")
        for f in features[:8]:
            if not isinstance(f, dict):
                continue
            lines.append(
                f"- {f.get('name')}: {f.get('what_it_does')} | impl: {(f.get('how_implemented') or '')[:140]}"
            )

    if pack.get("apis_or_entrypoints"):
        lines.append("MAIN ENTRY / APIS (labels): " + "; ".join(str(x)[:80] for x in pack["apis_or_entrypoints"][:8]))

    mods = pack.get("modules") or []
    if mods:
        lines.append("MODULES / AREAS (private verification anchors):")
        for m in mods[:8]:
            files = ", ".join(m.get("key_files") or [])[:120]
            lines.append(
                f"- {m.get('name')}: {m.get('role')} | how: {(m.get('how_it_works') or '')[:140]} | files: {files}"
            )

    for c in (pack.get("critical_paths") or [])[:5]:
        lines.append(
            f"FLOW: {c.get('flow')} | probe: {c.get('what_to_probe')} | private files: {', '.join(c.get('files') or [])}"
        )

    for d in (pack.get("design_decisions") or [])[:5]:
        lines.append(
            f"DECISION: {d.get('decision')} — why: {d.get('why_likely')} — ask: {d.get('challenge_question')}"
        )

    for w in (pack.get("weak_spots") or [])[:5]:
        lines.append(f"WEAK: {w.get('area')} — ask: {w.get('viva_angle')} (evidence: {w.get('evidence')})")

    for s in (pack.get("security_and_quality") or [])[:4]:
        lines.append(f"QUALITY: {s}")

    plan = pack.get("viva_plan") or []
    if plan:
        lines.append(
            "PREFERRED VIVA PLAN (spoken questions — follow roughly in order; "
            "paths in parentheses are PRIVATE, do not read them aloud):"
        )
        for i, q in enumerate(plan[:8], 1):
            targets = ", ".join(q.get("targets") or [])
            path_note = f" [private: {targets}]" if targets else ""
            lines.append(f"  {i}. [{q.get('difficulty')}] {q.get('q')}{path_note}")

    text = "\n".join(lines)
    if len(text) > max_chars:
        text = text[: max_chars - 20].rstrip() + "\n…[brief truncated]"
    return text


def practice_questions_from_pack(pack: dict) -> list[str]:
    return [str(q.get("q")) for q in (pack.get("viva_plan") or []) if q.get("q")][:8]


def focus_topics_from_pack(pack: dict) -> list[str]:
    topics: list[str] = []
    for m in pack.get("modules") or []:
        name = m.get("name")
        if name and name not in topics:
            topics.append(str(name))
    for w in pack.get("weak_spots") or []:
        a = w.get("area")
        if a and a not in topics:
            topics.append(str(a))
    return topics[:8]


# --- legacy helpers kept for older routes ---

def analyze_codebase(files: dict[str, str]) -> dict:
    """Legacy thin analysis — prefer build_knowledge_pack for new flow."""
    pack = build_knowledge_pack(files, None)
    return {
        "architecture": pack.get("architecture"),
        "key_files": select_top_files(files, None, 8),
        "patterns": [m.get("name") for m in pack.get("modules") or []],
        "question_hooks": [q.get("q") for q in pack.get("viva_plan") or []],
        "knowledge_pack": pack,
        "file_list": list(files.keys()),
    }


def generate_code_question(
    analysis: dict, files: dict[str, str], covered: list[str], language: str
) -> dict:
    key_files = analysis.get("key_files") or list(files.keys())
    if key_files and isinstance(key_files[0], dict):
        key_files = [k.get("path") for k in key_files if k.get("path")]
    target = next((f for f in key_files if f not in covered and f in files), None)
    if target is None:
        target = next(iter(files), None)
    excerpt = f"### {target}\n{files.get(target, '')[:4000]}" if target else "(no code available)"
    result = gemini_service.generate_json(
        prompts.CODE_QUESTION.format(
            analysis={k: v for k, v in analysis.items() if k not in ("file_list", "knowledge_pack")},
            excerpt=excerpt,
            covered=", ".join(covered) or "nothing yet",
            language=language,
        ),
        prompts.VIVA_EXAMINER,
    )
    if not result or "question" not in result:
        result = {
            "question": f"Walk me through the responsibilities of {target or 'your main module'} and one design decision you made there.",
            "topic": "code architecture",
            "file": target,
            "expected_answer": "A clear explanation of the module's role and a justified design decision.",
        }
    result.setdefault("file", target)
    return result
