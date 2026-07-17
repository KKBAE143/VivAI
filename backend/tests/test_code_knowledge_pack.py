"""Knowledge pack rendering & deterministic fallback (no Gemini required)."""
from ai import code_aware_viva


def test_deterministic_pack_uses_real_paths_only():
    files = {
        "app/main.py": "def main():\n    return 1\n",
        "app/api/routes.py": "from fastapi import APIRouter\nrouter = APIRouter()\n",
        "app/utils/helpers.py": "def helper():\n    pass\n",
    }
    structure = {
        "file_list": list(files.keys()),
        "top_files": ["app/main.py", "app/api/routes.py"],
        "languages": {"Python": 3},
        "layers": {"services": ["app/api/routes.py"], "utils": ["app/utils/helpers.py"], "ui": []},
        "security": [{"title": "Debug Mode", "severity": "medium", "path": "app/main.py", "desc": "x"}],
        "patterns": [],
        "health": {"score": 80, "grade": "B"},
    }
    pack = code_aware_viva.deterministic_knowledge_pack(files, structure)
    assert pack["modules"]
    assert pack["viva_plan"]
    # Spoken questions must not be monorepo path trivia
    for q in pack["viva_plan"]:
        assert ".py" not in q["q"] or "file" not in q["q"].lower()
        assert "app/main.py" not in q["q"]
        for t in q.get("targets") or []:
            assert t in files
    assert "what is this project" in pack["viva_plan"][0]["q"].lower() or "project" in pack["viva_plan"][0]["q"].lower()
    brief = code_aware_viva.render_pack_for_live(pack)
    assert len(brief) <= code_aware_viva.LIVE_BRIEF_MAX_CHARS
    assert "CODEBASE KNOWLEDGE PACK" in brief
    assert "NEVER" in brief and "file path" in brief.lower() or "paths" in brief.lower()


def test_validate_strips_invented_paths():
    files = {"src/a.ts": "export const a = 1;\n"}
    raw = {
        "project_one_liner": "demo",
        "stack": ["TS"],
        "architecture": "tiny",
        "modules": [{"name": "A", "role": "x", "key_files": ["src/a.ts", "src/FAKE.ts"], "how_it_works": "y", "risks": []}],
        "critical_paths": [],
        "design_decisions": [],
        "data_model": "",
        "apis_or_entrypoints": [],
        "weak_spots": [],
        "security_and_quality": [],
        "glossary": [],
        "viva_plan": [{"q": "What is a?", "targets": ["src/a.ts", "nope.ts"], "difficulty": "Easy", "expected_points": []}],
    }
    pack = code_aware_viva.validate_knowledge_pack(raw, files, {"file_list": ["src/a.ts"]})
    assert pack["modules"][0]["key_files"] == ["src/a.ts"]
    assert pack["viva_plan"][0]["targets"] == ["src/a.ts"]


def test_render_pack_hard_cap():
    pack = {
        "project_one_liner": "x" * 200,
        "stack": ["a"] * 20,
        "architecture": "y" * 2000,
        "modules": [
            {
                "name": f"M{i}",
                "role": "r" * 100,
                "key_files": [f"f{i}.py"],
                "how_it_works": "h" * 200,
                "risks": [],
            }
            for i in range(20)
        ],
        "critical_paths": [],
        "design_decisions": [],
        "data_model": "d" * 400,
        "apis_or_entrypoints": [f"e{i}" for i in range(20)],
        "weak_spots": [],
        "security_and_quality": [f"s{i}" for i in range(20)],
        "glossary": [],
        "viva_plan": [{"q": f"Q{i} " + ("z" * 100), "targets": [], "difficulty": "Hard", "expected_points": []} for i in range(20)],
    }
    brief = code_aware_viva.render_pack_for_live(pack, max_chars=500)
    assert len(brief) <= 500
