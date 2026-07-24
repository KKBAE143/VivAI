---
kind: external_dependency
name: Google Gemini API - AI Model Provider
slug: google-gemini-api
category: external_dependency
category_hints:
    - vendor_identity
    - sdk_real_api
    - framework_behavior
scope:
    - '**'
source_files:
    - backend/ai/gemini_service.py
    - backend/ai/live_service.py
    - backend/core/config.py
---

Core AI model provider using google-genai SDK. Text generation uses gemini-2.0-flash model, live audio/video sessions use gemini-3.1-flash-live-preview with fallback to gemini-2.5-flash-live-preview. Real-time streaming via WebSocket proxy handles PCM audio (16kHz input, 24kHz output) and JPEG frames (~1fps). Code processing is ephemeral - files loaded into memory only during session, never persisted in LLM training sets. Voice configuration uses prebuilt voices like 'Puck'.