"""Central Gemini client wrapper (google-genai, free tier)."""
import json
import re

from google import genai
from google.genai import types

from core.config import get_settings

LLM_MODEL = "gemini-2.0-flash"
VLM_MODEL = "gemini-2.0-flash"

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_settings().gemini_api_key)
    return _client


def generate_text(prompt: str, system_instruction: str | None = None) -> str:
    config = None
    if system_instruction:
        config = types.GenerateContentConfig(system_instruction=system_instruction)
    response = _get_client().models.generate_content(
        model=LLM_MODEL, contents=[prompt], config=config
    )
    return response.text or ""


def generate_with_image(prompt: str, image_data: bytes, mime_type: str,
                        system_instruction: str | None = None) -> str:
    config = None
    if system_instruction:
        config = types.GenerateContentConfig(system_instruction=system_instruction)
    response = _get_client().models.generate_content(
        model=VLM_MODEL,
        contents=[prompt, types.Part.from_bytes(data=image_data, mime_type=mime_type)],
        config=config,
    )
    return response.text or ""


def stream_text(prompt: str, system_instruction: str | None = None):
    """Yield text chunks (for SSE streaming)."""
    config = None
    if system_instruction:
        config = types.GenerateContentConfig(system_instruction=system_instruction)
    response = _get_client().models.generate_content_stream(
        model=LLM_MODEL, contents=[prompt], config=config
    )
    for chunk in response:
        if chunk.text:
            yield chunk.text


def _extract_json(text: str):
    """Pull the first JSON object/array out of a model response."""
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    match = re.search(r"[\[{].*[\]}]", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON found in model response")
    return json.loads(match.group(0))


def generate_json(prompt: str, system_instruction: str | None = None, default=None):
    """Generate and parse a JSON response; return `default` on any failure."""
    try:
        return _extract_json(generate_text(prompt, system_instruction))
    except Exception:
        return default


def generate_json_with_image(prompt: str, image_data: bytes, mime_type: str, default=None):
    try:
        return _extract_json(generate_with_image(prompt, image_data, mime_type))
    except Exception:
        return default
