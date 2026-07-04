"""Real-time presentation sentiment: Gemini VLM frame analysis + nudge engine."""
from ai import gemini_service, prompts

DEFAULT_METRICS = {"confidence": 60, "eye_contact": 60, "energy": 60, "stress": 30, "observation": ""}


def analyze_frame(image_data: bytes, mime_type: str = "image/jpeg") -> dict:
    result = gemini_service.generate_json_with_image(
        prompts.SENTIMENT_FRAME, image_data, mime_type, default=None
    )
    if not result:
        return dict(DEFAULT_METRICS)
    for key in ("confidence", "eye_contact", "energy", "stress"):
        try:
            result[key] = max(0, min(100, int(result.get(key, DEFAULT_METRICS[key]))))
        except (TypeError, ValueError):
            result[key] = DEFAULT_METRICS[key]
    return result


def generate_nudges(metrics: dict, history: list[dict]) -> list[str]:
    """Threshold-based nudges; require the signal to persist over the last 3 samples."""
    nudges: list[str] = []
    recent = history[-3:] + [metrics]

    def persistent(key: str, threshold: int, below: bool = True) -> bool:
        vals = [m.get(key, 60) for m in recent]
        return len(vals) >= 3 and all((v < threshold) if below else (v > threshold) for v in vals)

    if persistent("confidence", 45):
        nudges.append("Straighten up and slow down — you know this material. Take a breath.")
    if persistent("eye_contact", 40):
        nudges.append("Look at the camera more — imagine the panel sitting behind it.")
    if persistent("stress", 70, below=False):
        nudges.append("You seem tense. Pause for two seconds, then continue at a calmer pace.")
    if persistent("energy", 35):
        nudges.append("Bring more energy — vary your tone and emphasize key points.")
    return nudges
