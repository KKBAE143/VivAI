"""Templates & guidelines content (served statically from the backend)."""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/templates", tags=["templates"])

TEMPLATES: dict[str, dict] = {
    "pbl-project-guide": {
        "title": "PBL Project Guide",
        "category": "PBL",
        "summary": "End-to-end guide for Project Based Learning submissions.",
        "content": "# PBL Project Guide\n\n## 1. Problem Selection\nPick a real, local problem. Faculty reward relevance over complexity.\n\n## 2. Documentation Structure\n- Abstract (250 words)\n- Problem statement\n- Literature survey (5+ references)\n- Methodology with block diagram\n- Results & screenshots\n- Future scope\n\n## 3. Common Mistakes\n- Copy-pasted abstracts\n- Missing citations\n- No comparison with existing solutions",
        "checklist": [
            "Problem statement approved by guide",
            "Abstract under 250 words",
            "5+ literature references",
            "Block diagram included",
            "Results section with screenshots",
            "Plagiarism check under 10%",
        ],
    },
    "major-project-guide": {
        "title": "Major Project Guide",
        "category": "Major",
        "summary": "Final-year major project report and demo preparation.",
        "content": "# Major Project Guide\n\n## Report Format\n60-80 pages, IEEE citation style, chapter-wise structure.\n\n## Demo Day\nPrepare a 10-minute demo + 5-minute Q&A. Keep a backup video of the working demo.\n\n## Viva Preparation\nKnow every line of your own code. Faculty often asks 'why this and not that'.",
        "checklist": [
            "Report follows college format",
            "IEEE citations",
            "Working demo + backup video",
            "Each member knows the full architecture",
            "Practice viva completed",
        ],
    },
    "mini-project-guide": {
        "title": "Mini Project Guide",
        "category": "Mini",
        "summary": "Semester mini project essentials.",
        "content": "# Mini Project Guide\n\nKeep scope small and finish fully. A complete small project scores better than an incomplete ambitious one.\n\n## Timeline\n- Week 1-2: Topic + design\n- Week 3-6: Build\n- Week 7: Test + document\n- Week 8: Present",
        "checklist": [
            "Scope agreed with faculty",
            "Weekly progress logged",
            "README with setup steps",
            "Presentation deck ready",
        ],
    },
    "viva-prep-guide": {
        "title": "Viva Preparation Guide",
        "category": "Viva",
        "summary": "How to prepare for project and subject vivas.",
        "content": "# Viva Preparation Guide\n\n## Golden Rules\n1. Never bluff — say 'I will check and confirm' instead.\n2. Answer in structure: definition → example → application.\n3. Know your project's weakest part; that's what gets asked.\n\n## Use AI Mock Viva\nRun at least 3 sessions per subject. Review the weakness heatmap before the real viva.",
        "checklist": [
            "3+ AI mock viva sessions done",
            "Weakness heatmap reviewed",
            "Project architecture explainable in 2 minutes",
            "Tech-stack 'why' questions prepared",
        ],
    },
}


@router.get("")
def list_templates():
    return [
        {"slug": slug, "title": t["title"], "category": t["category"], "summary": t["summary"]}
        for slug, t in TEMPLATES.items()
    ]


@router.get("/{slug}")
def get_template(slug: str):
    t = TEMPLATES.get(slug)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"slug": slug, **t}


@router.get("/{slug}/checklist")
def get_checklist(slug: str):
    t = TEMPLATES.get(slug)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"slug": slug, "checklist": t["checklist"]}
