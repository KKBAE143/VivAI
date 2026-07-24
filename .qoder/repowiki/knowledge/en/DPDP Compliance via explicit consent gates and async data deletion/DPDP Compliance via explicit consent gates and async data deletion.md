---
kind: design
name: DPDP Compliance via explicit consent gates and async data deletion
source: session
category: adr
---

# DPDP Compliance via explicit consent gates and async data deletion

_Source: coding plans from commit period 02d068d → cf6f9d6 — records intent at planning time; the implementation may lag or differ._

**Status:** accepted

## Context
Indian DPDP Act requires explicit user consent for data processing, a verifiable record of acceptance, and the ability to fully delete personal data on request. The app needed compliance hooks before allowing users to create viva or presentation sessions.

## Decision drivers
- legal compliance with DPDP Act
- auditability of consent events
- user-controlled data deletion
- non-blocking deletion workflow

## Considered options
- **Inline consent middleware blocking session creation** — pros: simple enforcement point; prevents non-compliant usage; cons: adds a dependency check to every session endpoint
- **Async deletion service with status tracking** — pros: long cascade deletes won't block API responses; users can poll progress; cons: requires extra tables and state machine in `data_deletion_requests`

## Decision
Add `require_consent` dependency in `core/deps.py` that returns 403 when `consent_accepted_at` is null, applied to all session-creating endpoints. Implement an async `deletion_service.py` that cascades deletes across viva/presentation/activity/file/code/flashcard tables and soft-deletes the profile, with status exposed through `/api/privacy/delete-status`.

## Consequences
New signups must accept ToS/Privacy before any session can start. Data deletion is irreversible but auditable via `consent_log` and `data_deletion_requests`. Frontend shows a 'Danger Zone' on `/profile` and a dedicated `/privacy` page.