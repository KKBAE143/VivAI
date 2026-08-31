"""Single-concurrency polling process for presentation material ingestion."""
from __future__ import annotations

import hashlib
import math
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from core.config import get_settings
from core.database import get_supabase
from core.logging import configure_logging, get_logger
from worker.extractor import ExtractedMaterial, MaterialError, extract, extract_pdf, summarize, validate_source

LOG = get_logger("presentation_worker")
POLL_SECONDS = max(2, int(os.getenv("PRESENTATION_WORKER_POLL_SECONDS", "8")))
LEASE_SECONDS = max(60, int(os.getenv("PRESENTATION_WORKER_LEASE_SECONDS", "900")))
MAX_ATTEMPTS = max(1, int(os.getenv("PRESENTATION_WORKER_MAX_ATTEMPTS", "3")))
DERIVED_PREFIX = "derived/presentation"
EXTRACTION_VERSION = "presentation-worker-v1"


class LeaseLostError(RuntimeError):
    """Raised when another worker owns a material after this lease expires."""


def _safe_pdf_scale(page: Any, preferred: float, *, max_dimension: int, max_pixels: int) -> float | None:
    """Bound raster allocation before pdfium creates the bitmap."""
    width, height = page.get_size()
    width, height = float(width), float(height)
    if width <= 0 or height <= 0:
        return None
    scale = min(
        preferred,
        max_dimension / max(width, height),
        math.sqrt(max_pixels / (width * height)),
    )
    # Extremely large media boxes require impractically tiny render scales and
    # are treated as an incomplete preview instead of allocating a huge bitmap.
    return scale if scale >= 0.02 else None


def source_type(file: dict[str, Any]) -> str:
    name = (file.get("original_name") or "").lower()
    mime = (file.get("mime_type") or "").lower()
    for suffix in ("pptx", "ppt", "docx", "doc", "pdf", "txt"):
        if name.endswith("." + suffix):
            return suffix
    return {"application/pdf": "pdf", "text/plain": "txt"}.get(mime, "")


def _convert_to_pdf(data: bytes, suffix: str, warnings: list[str]) -> bytes | None:
    return _convert_with_libreoffice(data, suffix, "pdf", warnings, "visual rendering")


def _convert_with_libreoffice(data: bytes, suffix: str, target: str, warnings: list[str], purpose: str) -> bytes | None:
    executable = shutil.which("libreoffice") or shutil.which("soffice")
    if not executable:
        warnings.append(f"LibreOffice unavailable; {purpose} was skipped")
        return None
    with tempfile.TemporaryDirectory(prefix="presentation-") as directory:
        root = Path(directory)
        source = root / f"source.{suffix}"
        profile = root / "lo-profile"
        profile.mkdir()
        source.write_bytes(data)
        try:
            completed = subprocess.run([
                executable,
                f"-env:UserInstallation={profile.as_uri()}",
                "--headless", "--safe-mode", "--nologo", "--nodefault", "--nofirststartwizard", "--norestore",
                "--convert-to", target, "--outdir", str(root), str(source),
            ], capture_output=True, text=True, timeout=120, check=False)
        except (OSError, subprocess.TimeoutExpired):
            warnings.append(f"LibreOffice {purpose} conversion failed")
            return None
        diagnostics = f"{completed.stdout}\n{completed.stderr}".lower()
        if "font" in diagnostics and ("substitut" in diagnostics or "not found" in diagnostics):
            warnings.append("One or more source fonts were unavailable and may have been substituted")
        output = root / f"source.{target}"
        if completed.returncode or not output.exists():
            warnings.append(f"LibreOffice could not complete {purpose} conversion")
            return None
        return output.read_bytes()


def _convert_legacy_to_modern(data: bytes, suffix: str, warnings: list[str]) -> tuple[bytes, str] | None:
    target = {"ppt": "pptx", "doc": "docx"}.get(suffix)
    if not target:
        return None
    converted = _convert_with_libreoffice(data, suffix, target, warnings, "semantic extraction")
    return (converted, target) if converted else None


def _render_pdf(
    pdf: bytes,
    material_id: str,
    units: list[dict[str, Any]],
    warnings: list[str],
    heartbeat: Callable[[], None] | None = None,
) -> dict[int, tuple[bytes, bytes]]:
    try:
        import pypdfium2 as pdfium
        from PIL import Image
    except ImportError:
        warnings.append("PDF renderer unavailable; previews were skipped")
        return {}
    rendered: dict[int, tuple[bytes, bytes]] = {}
    try:
        document = pdfium.PdfDocument(pdf)
        for index in range(min(len(document), len(units), 100)):
            if heartbeat and index % 4 == 0:
                heartbeat()
            page = document[index]
            scale = _safe_pdf_scale(page, 1.5, max_dimension=4096, max_pixels=12_000_000)
            if scale is None:
                warnings.append("An oversized page preview was skipped")
                continue
            image = page.render(scale=scale).to_pil().convert("RGB")
            image.thumbnail((1400, 1400))
            import io
            preview = io.BytesIO()
            image.save(preview, "PNG", optimize=True)
            thumbnail_image = image.copy()
            thumbnail_image.thumbnail((360, 360))
            thumbnail = io.BytesIO()
            thumbnail_image.save(thumbnail, "PNG", optimize=True)
            rendered[index] = (preview.getvalue(), thumbnail.getvalue())
    except Exception:
        warnings.append("PDF rendering failed; previews were skipped")
    return rendered


def _ocr_sparse(
    pdf: bytes,
    units: list[dict[str, Any]],
    warnings: list[str],
    heartbeat: Callable[[], None] | None = None,
) -> None:
    if not shutil.which("tesseract"):
        if any(len(unit.get("search_text", "")) < 20 for unit in units):
            warnings.append("Tesseract unavailable; sparse pages were not OCRed")
        return
    try:
        import pypdfium2 as pdfium
        import pytesseract
    except ImportError:
        return
    try:
        document = pdfium.PdfDocument(pdf)
        for index, unit in enumerate(units[:len(document)]):
            if heartbeat and index % 4 == 0:
                heartbeat()
            if len(unit.get("search_text", "")) >= 20:
                continue
            page = document[index]
            scale = _safe_pdf_scale(page, 2, max_dimension=3200, max_pixels=8_000_000)
            if scale is None:
                warnings.append("OCR skipped an oversized page")
                continue
            image = page.render(scale=scale).to_pil()
            text = pytesseract.image_to_string(image).strip()
            if text:
                element = {"id": hashlib.sha256(f"{unit['unit_key']}:ocr:0".encode()).hexdigest()[:20], "type": "text", "text": text, "provenance": "ocr", "source_class": "ocr"}
                unit["content"]["elements"].append(element)
                unit["search_text"] = (unit["search_text"] + " " + text).strip()
                unit["analysis"] = {**unit["analysis"], "ocr": True}
    except Exception:
        warnings.append("OCR was unavailable for one or more sparse pages")


class IngestionWorker:
    def __init__(self) -> None:
        self.id = os.getenv("PRESENTATION_WORKER_ID", f"presentation-{uuid.uuid4().hex[:12]}")
        self.sb = get_supabase()
        self.bucket = get_settings().storage_bucket

    def claim(self) -> dict[str, Any] | None:
        response = self.sb.rpc("claim_presentation_material", {"worker_id": self.id, "lease_seconds": LEASE_SECONDS}).execute()
        return response.data[0] if response.data else None

    def _renew_lease(self, material_id: str) -> None:
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=LEASE_SECONDS)).isoformat()
        response = (
            self.sb.table("presentation_materials")
            .update({"lease_expires_at": expires_at, "updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", material_id)
            .eq("status", "processing")
            .eq("lease_owner", self.id)
            .execute()
        )
        if not response.data:
            raise LeaseLostError("presentation material lease is no longer owned by this worker")

    def _source(self, material: dict[str, Any]) -> tuple[dict[str, Any], bytes, str]:
        file_id = material.get("file_id")
        response = self.sb.table("files").select("id,storage_path,mime_type,original_name").eq("id", file_id).limit(1).execute()
        if not response.data:
            raise MaterialError("source file no longer exists")
        file = response.data[0]
        kind = source_type(file)
        if not kind:
            raise MaterialError("unsupported source format")
        payload = self.sb.storage.from_(self.bucket).download(file["storage_path"])
        expected_hash = material.get("source_sha256")
        if expected_hash and hashlib.sha256(payload).hexdigest() != expected_hash:
            raise MaterialError("source file changed after it was queued")
        return file, payload, kind

    def _upload_previews(self, material_id: str, rendered: dict[int, tuple[bytes, bytes]], units: list[dict[str, Any]]) -> None:
        for ordinal, (preview, thumbnail) in rendered.items():
            if ordinal % 4 == 0:
                self._renew_lease(material_id)
            path = f"{DERIVED_PREFIX}/{material_id}/{ordinal + 1}.png"
            thumbnail_path = f"{DERIVED_PREFIX}/{material_id}/{ordinal + 1}-thumb.png"
            storage = self.sb.storage.from_(self.bucket)
            for asset_path, image in ((path, preview), (thumbnail_path, thumbnail)):
                try:
                    storage.upload(asset_path, image, {"content-type": "image/png", "upsert": "true"})
                except Exception:
                    # A retry normally sees an existing deterministic object path.
                    storage.update(asset_path, image, {"content-type": "image/png"})
            units[ordinal]["preview_path"] = path
            units[ordinal]["thumbnail_path"] = thumbnail_path

    @staticmethod
    def _bounded_model_analysis(material_id: str, units: list[dict[str, Any]], warnings: list[str]) -> dict[str, Any] | None:
        """One optional, grounded interpretation call; native facts stay separate."""
        if not get_settings().gemini_api_key:
            warnings.append("Gemini material analysis was skipped because no API key is configured")
            return None
        try:
            from ai import gemini_service
            outline = [
                {
                    "unit_key": unit["unit_key"],
                    "title": unit.get("title", ""),
                    # Full document coverage is bounded to 60 units; compact
                    # element evidence keeps one request within a small budget.
                    "elements": [
                        {"id": element["id"], "type": element.get("type"), "text": str(element.get("text", ""))[:80]}
                        for element in unit.get("content", {}).get("elements", [])[:3]
                    ],
                }
                for unit in units[:60]
            ]
            raw = gemini_service.generate_json(
                "Interpret this material only from the supplied evidence. These are hypotheses, never source facts. "
                "Every interpretation must reference an exact unit_key and element_id supplied below. "
                "Return JSON shaped as "
                '{"claims":[{"unit_key":"key","element_id":"id","text":"short"}],'
                '"questions":[{"unit_key":"key","element_id":"id","text":"short"}],'
                '"likely_challenges":[{"unit_key":"key","element_id":"id","text":"short"}],'
                '"evaluator_concerns":[{"unit_key":"key","element_id":"id","text":"short"}],'
                '"material_weaknesses":[{"unit_key":"key","element_id":"id","text":"short"}],'
                '"numerical_justification_gaps":[{"unit_key":"key","element_id":"id","text":"short"}],'
                '"unsupported_claims":[{"unit_key":"key","element_id":"id","text":"short"}],'
                '"recommended_corrections":[{"unit_key":"key","element_id":"id","text":"short"}],'
                '"candidate_cross_unit_inconsistencies":[{"references":[{"unit_key":"key","element_id":"id"},{"unit_key":"key","element_id":"id"}],"text":"short"}]}. '
                f"Outline: {outline}",
                default=None,
                retries=0,
            )
        except Exception:
            warnings.append("Gemini material analysis unavailable; deterministic analysis retained")
            return None
        if not isinstance(raw, dict):
            warnings.append("Gemini material analysis returned no usable result")
            return None
        element_ids = {
            unit["unit_key"]: {element.get("id") for element in unit.get("content", {}).get("elements", [])}
            for unit in units
        }

        def references(field: str, maximum: int = 24, claim: bool = False) -> list[dict[str, str]]:
            valid = []
            values = raw.get(field, [])
            if not isinstance(values, list):
                return valid
            for item in values[:maximum]:
                if not isinstance(item, dict):
                    continue
                unit_key, element_id, text = item.get("unit_key"), item.get("element_id"), item.get("text")
                if unit_key not in element_ids or element_id not in element_ids[unit_key] or not isinstance(text, str) or not text.strip():
                    continue
                record = {"unit_key": unit_key, "element_id": element_id, "text": text.strip()[:300], "source_class": "visual_inference"}
                if claim:
                    record["id"] = "claim_" + hashlib.sha256(f"{material_id}:{unit_key}:{element_id}:{record['text']}".encode()).hexdigest()[:20]
                valid.append(record)
            return valid

        inconsistencies = []
        raw_inconsistencies = raw.get("candidate_cross_unit_inconsistencies", [])
        if not isinstance(raw_inconsistencies, list):
            raw_inconsistencies = []
        for item in raw_inconsistencies[:12]:
            if not isinstance(item, dict) or not isinstance(item.get("references"), list) or not isinstance(item.get("text"), str):
                continue
            references_for_item = []
            for reference in item["references"]:
                if not isinstance(reference, dict):
                    continue
                unit_key, element_id = reference.get("unit_key"), reference.get("element_id")
                if unit_key in element_ids and element_id in element_ids[unit_key]:
                    references_for_item.append({"unit_key": unit_key, "element_id": element_id})
            unique_references = list({(ref["unit_key"], ref["element_id"]): ref for ref in references_for_item}.values())
            if len(unique_references) == 2 and item["text"].strip():
                inconsistencies.append({"references": unique_references, "text": item["text"].strip()[:300], "source_class": "visual_inference"})
        return {
            "claims": references("claims", claim=True),
            "candidate_questions": references("questions"),
            "likely_challenges": references("likely_challenges"),
            "evaluator_concerns": references("evaluator_concerns"),
            "material_weaknesses": references("material_weaknesses"),
            "numerical_justification_gaps": references("numerical_justification_gaps"),
            "unsupported_claims": references("unsupported_claims", claim=True),
            "recommended_corrections": references("recommended_corrections"),
            "candidate_cross_unit_inconsistencies": inconsistencies,
        }

    @staticmethod
    def _merge_interpretations(units: list[dict[str, Any]], interpretation: dict[str, Any]) -> None:
        by_key = {unit["unit_key"]: unit for unit in units}
        for field in ("claims", "candidate_questions"):
            for item in interpretation[field]:
                unit = by_key[item["unit_key"]]
                unit.setdefault("analysis", {}).setdefault("visual_inference", {}).setdefault(field, []).append(item)

    def _publish(self, material: dict[str, Any], result: ExtractedMaterial, warnings: list[str]) -> None:
        material_id = material["id"]
        self._renew_lease(material_id)
        units = result.units
        global_analysis = summarize(units)
        model_analysis = self._bounded_model_analysis(material_id, units, warnings)
        interpretation = model_analysis or {
            "claims": [], "candidate_questions": [], "likely_challenges": [], "material_weaknesses": [],
            "evaluator_concerns": [], "numerical_justification_gaps": [], "unsupported_claims": [],
            "recommended_corrections": [], "candidate_cross_unit_inconsistencies": [],
        }
        # This happens before insertion so session/deck consumers see one
        # coherent unit record. Source facts remain in each unit's native analysis.
        self._merge_interpretations(units, interpretation)
        global_analysis.update(interpretation)
        status = "partial" if warnings else "ready"
        response = self.sb.rpc("publish_presentation_material", {
            "target_material_id": material_id,
            "worker_id": self.id,
            "units_payload": units,
            "final_status": status,
            "warning_payload": warnings,
            "analysis_payload": global_analysis,
            "worker_extraction_version": EXTRACTION_VERSION,
        }).execute()
        if not response.data:
            raise LeaseLostError("presentation material lease was lost before publish")

    def _fail(self, material: dict[str, Any], error: str) -> None:
        self.sb.table("presentation_materials").update({"status": "failed", "processing_error": error[:500], "lease_owner": None, "lease_expires_at": None}).eq("id", material["id"]).eq("lease_owner", self.id).execute()

    def _retry_or_fail(self, material: dict[str, Any], error: str) -> None:
        if int(material.get("attempts") or 0) >= MAX_ATTEMPTS:
            self._fail(material, error)
            return
        self.sb.table("presentation_materials").update({
            "status": "queued",
            "processing_error": "Temporary processing failure; retrying automatically",
            "lease_owner": None,
            "lease_expires_at": None,
        }).eq("id", material["id"]).eq("lease_owner", self.id).execute()

    def process(self, material: dict[str, Any]) -> None:
        warnings: list[str] = []
        started_at = time.monotonic()
        kind = str(material.get("source_type") or "unknown")
        try:
            self._renew_lease(material["id"])
            _file, data, kind = self._source(material)
            if not material.get("source_sha256"):
                source_hash = hashlib.sha256(data).hexdigest()
                self.sb.table("presentation_materials").update(
                    {"source_sha256": source_hash}
                ).eq("id", material["id"]).eq("lease_owner", self.id).execute()
                material["source_sha256"] = source_hash
            native = None
            if kind in {"ppt", "doc"}:
                validate_source(data, kind)
                modern = _convert_legacy_to_modern(data, kind, warnings)
                if modern:
                    native = extract(*modern)
                else:
                    warnings.append("legacy Office semantics fell back to rendered PDF text")
            else:
                native = extract(data, kind)
            visual_pdf = data if kind == "pdf" else _convert_to_pdf(data, kind, warnings)
            self._renew_lease(material["id"])
            if native is None:
                if not visual_pdf:
                    raise MaterialError("legacy Office conversion failed")
                native = extract_pdf(visual_pdf)
                warnings.append("semantic extraction is based on rendered legacy Office pages")
            if visual_pdf:
                previews = _render_pdf(
                    visual_pdf,
                    material["id"],
                    native.units,
                    warnings,
                    lambda: self._renew_lease(material["id"]),
                )
                self._upload_previews(material["id"], previews, native.units)
                _ocr_sparse(
                    visual_pdf,
                    native.units,
                    warnings,
                    lambda: self._renew_lease(material["id"]),
                )
            elif kind != "txt":
                warnings.append("visual previews were not generated")
            warnings.extend(native.warnings)
            self._publish(material, native, list(dict.fromkeys(warnings)))
            LOG.info(
                "presentation material processed",
                extra={
                    "event": "material_processed",
                    "material_id": material["id"],
                    "source_type": kind,
                    "units": len(native.units),
                    "status": "partial" if warnings else "ready",
                    "duration_ms": round((time.monotonic() - started_at) * 1000),
                },
            )
        except MaterialError as exc:
            self._fail(material, str(exc))
            LOG.warning(
                "presentation material failed",
                extra={
                    "event": "material_failed",
                    "material_id": material.get("id"),
                    "source_type": kind,
                    "reason": str(exc),
                    "duration_ms": round((time.monotonic() - started_at) * 1000),
                },
            )
        except LeaseLostError:
            LOG.warning("presentation material lease lost id=%s", material.get("id"))
        except Exception:
            # Do not log source content or storage URLs. Leases make a later
            # claim retry safe; recording this generic error avoids leaking data.
            self._retry_or_fail(material, "processing failed after automatic retries; retry the material")
            LOG.exception("presentation material processing error id=%s", material.get("id"))

    def run(self, stop_event: threading.Event | None = None) -> None:
        stop_event = stop_event or threading.Event()
        while not stop_event.is_set():
            try:
                material = self.claim()
                if material:
                    self.process(material)
                    continue
            except Exception:
                LOG.exception("presentation worker polling error")
            stop_event.wait(POLL_SECONDS)


def main() -> None:
    configure_logging()
    IngestionWorker().run()


if __name__ == "__main__":
    main()
