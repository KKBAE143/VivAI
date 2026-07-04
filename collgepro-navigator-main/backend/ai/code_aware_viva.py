"""Code-Aware Viva engine: parse source, analyze, ask implementation-specific questions."""
import io
import zipfile

from ai import gemini_service, prompts

SOURCE_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".c", ".cpp", ".h", ".cs",
    ".go", ".rs", ".rb", ".php", ".sql", ".html", ".css", ".ipynb", ".kt", ".swift",
}
SKIP_DIRS = {"node_modules", ".git", "venv", "__pycache__", "dist", "build", ".next"}
MAX_FILE_CHARS = 6000
MAX_TOTAL_CHARS = 60000


def extract_source_files(zip_bytes: bytes) -> dict[str, str]:
    """Return {path: content} for source files inside a ZIP, size-capped."""
    files: dict[str, str] = {}
    total = 0
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            path = info.filename
            parts = path.split("/")
            if any(p in SKIP_DIRS for p in parts):
                continue
            if not any(path.endswith(ext) for ext in SOURCE_EXTENSIONS):
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


def build_digest(files: dict[str, str]) -> str:
    parts = [f"### FILE: {path}\n{content}" for path, content in files.items()]
    return "\n\n".join(parts)[:MAX_TOTAL_CHARS]


def analyze_codebase(files: dict[str, str]) -> dict:
    digest = build_digest(files)
    result = gemini_service.generate_json(prompts.CODE_ANALYSIS.format(digest=digest))
    if not result:
        result = {
            "architecture": "Automatic analysis unavailable.",
            "key_files": list(files.keys())[:5],
            "patterns": [],
            "question_hooks": [],
        }
    result["file_list"] = list(files.keys())
    return result


def generate_code_question(
    analysis: dict, files: dict[str, str], covered: list[str], language: str
) -> dict:
    # Rotate through key files so questioning covers the codebase.
    key_files = analysis.get("key_files") or list(files.keys())
    target = next((f for f in key_files if f not in covered and f in files), None)
    if target is None:
        target = next(iter(files), None)
    excerpt = f"### {target}\n{files.get(target, '')[:4000]}" if target else "(no code available)"
    result = gemini_service.generate_json(
        prompts.CODE_QUESTION.format(
            analysis={k: v for k, v in analysis.items() if k != "file_list"},
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
