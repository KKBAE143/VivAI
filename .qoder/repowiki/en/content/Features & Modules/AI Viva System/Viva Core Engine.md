# Viva Core Engine

<cite>
**Referenced Files in This Document**
- [viva_core.py](file://backend/ai/viva_core.py)
- [prompts.py](file://backend/ai/prompts.py)
- [registry.py](file://backend/ai/registry.py)
- [live_service.py](file://backend/ai/live_service.py)
- [code_aware_viva.py](file://backend/ai/code_aware_viva.py)
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [report_service.py](file://backend/ai/report_service.py)
- [team_live_service.py](file://backend/ai/team_live_service.py)
- [team_room.py](file://backend/ai/team_room.py)
- [viva.py](file://backend/api/viva.py)
- [live.py](file://backend/api/live.py)
- [config.py](file://backend/core/config.py)
- [errors.py](file://backend/core/errors.py)
- [schemas.py](file://backend/models/schemas.py)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes the Viva Core Engine, the central processing unit of the AI-powered examination system. It explains how the engine orchestrates question generation, adaptive difficulty adjustment, real-time assessment, and feedback delivery. It also documents the prompt management system across subject areas and question types, configuration options for exam parameters and scoring, and extension points for integrating new domains and evaluation algorithms.

## Project Structure
The Viva Core Engine is implemented primarily under backend/ai with supporting API routes under backend/api and shared configuration and models under backend/core and backend/models. The key modules include:
- Core orchestration and session state
- Prompt templates and registry
- Live session handling and team collaboration
- Code-aware viva flows
- Sentiment analysis and metrics
- External LLM integration
- Reporting and analytics

```mermaid
graph TB
subgraph "API Layer"
A["viva.py"]
B["live.py"]
end
subgraph "AI Core"
C["viva_core.py"]
D["prompts.py"]
E["registry.py"]
F["live_service.py"]
G["code_aware_viva.py"]
H["sentiment_analyzer.py"]
I["gemini_service.py"]
J["delivery_metrics.py"]
K["weakness_heatmap.py"]
L["report_service.py"]
M["team_live_service.py"]
N["team_room.py"]
end
subgraph "Shared"
O["config.py"]
P["errors.py"]
Q["schemas.py"]
end
A --> C
B --> F
C --> D
C --> E
C --> I
C --> H
C --> J
C --> K
C --> L
F --> M
F --> N
G --> I
M --> N
```

**Diagram sources**
- [viva.py](file://backend/api/viva.py)
- [live.py](file://backend/api/live.py)
- [viva_core.py](file://backend/ai/viva_core.py)
- [prompts.py](file://backend/ai/prompts.py)
- [registry.py](file://backend/ai/registry.py)
- [live_service.py](file://backend/ai/live_service.py)
- [code_aware_viva.py](file://backend/ai/code_aware_viva.py)
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [report_service.py](file://backend/ai/report_service.py)
- [team_live_service.py](file://backend/ai/team_live_service.py)
- [team_room.py](file://backend/ai/team_room.py)
- [config.py](file://backend/core/config.py)
- [errors.py](file://backend/core/errors.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [viva.py](file://backend/api/viva.py)
- [live.py](file://backend/api/live.py)
- [viva_core.py](file://backend/ai/viva_core.py)
- [prompts.py](file://backend/ai/prompts.py)
- [registry.py](file://backend/ai/registry.py)
- [live_service.py](file://backend/ai/live_service.py)
- [code_aware_viva.py](file://backend/ai/code_aware_viva.py)
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [report_service.py](file://backend/ai/report_service.py)
- [team_live_service.py](file://backend/ai/team_live_service.py)
- [team_room.py](file://backend/ai/team_room.py)
- [config.py](file://backend/core/config.py)
- [errors.py](file://backend/core/errors.py)
- [schemas.py](file://backend/models/schemas.py)

## Core Components
- Viva Core Orchestrator: Manages session lifecycle, question flow, difficulty adaptation, and response evaluation.
- Prompt Management System: Centralizes prompts per subject area, question type, and evaluation criteria; supports dynamic composition.
- Live Session Service: Handles real-time interactions, streaming responses, and concurrent participant coordination.
- Code-Aware Viva: Extends core logic to analyze code submissions and provide domain-specific feedback.
- Sentiment Analyzer: Evaluates tone and confidence from textual responses to inform adaptive behavior.
- Metrics and Analytics: Tracks delivery performance, knowledge gaps, and progress over time.
- External LLM Integration: Provides model access for generation and evaluation tasks.
- Team Collaboration: Enables multi-participant sessions with synchronized state and shared artifacts.

**Section sources**
- [viva_core.py](file://backend/ai/viva_core.py)
- [prompts.py](file://backend/ai/prompts.py)
- [registry.py](file://backend/ai/registry.py)
- [live_service.py](file://backend/ai/live_service.py)
- [code_aware_viva.py](file://backend/ai/code_aware_viva.py)
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [report_service.py](file://backend/ai/report_service.py)
- [team_live_service.py](file://backend/ai/team_live_service.py)
- [team_room.py](file://backend/ai/team_room.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)

## Architecture Overview
The Viva Core Engine follows a layered architecture:
- API Layer exposes endpoints for single-user and live sessions.
- Core Engine coordinates prompts, LLM calls, sentiment analysis, and metrics.
- Domain Extensions (e.g., code-aware) plug into the core via well-defined interfaces.
- Persistence and reporting are handled through services that aggregate session data.

```mermaid
sequenceDiagram
participant Client as "Client App"
participant API as "Viva API"
participant Core as "Viva Core"
participant Prompts as "Prompt Manager"
participant LLM as "Gemini Service"
participant Sent as "Sentiment Analyzer"
participant Metrics as "Delivery Metrics"
participant Report as "Report Service"
Client->>API : "Start session"
API->>Core : "initialize_session(params)"
Core->>Prompts : "resolve_prompt(subject, type)"
Prompts-->>Core : "prompt template"
Core->>LLM : "generate_question(context, prompt)"
LLM-->>Core : "question"
Core-->>Client : "question payload"
Client->>API : "submit_answer(answer)"
API->>Core : "evaluate_answer(session_id, answer)"
Core->>LLM : "evaluate(response, rubric)"
LLM-->>Core : "score + feedback"
Core->>Sent : "analyze_tone(answer)"
Sent-->>Core : "sentiment signals"
Core->>Metrics : "record_score_and_signals()"
Metrics-->>Core : "updated metrics"
Core->>Report : "persist_session_update()"
Report-->>Core : "ack"
Core-->>Client : "feedback + next_action"
```

**Diagram sources**
- [viva.py](file://backend/api/viva.py)
- [viva_core.py](file://backend/ai/viva_core.py)
- [prompts.py](file://backend/ai/prompts.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [report_service.py](file://backend/ai/report_service.py)

## Detailed Component Analysis

### Viva Core Orchestrator
Responsibilities:
- Session initialization and lifecycle management
- Question generation using resolved prompts and context
- Adaptive difficulty based on performance and sentiment signals
- Evaluation pipeline coordinating LLM scoring and feedback
- Metrics recording and report updates

Key behaviors:
- Resolves subject-specific prompts and question types
- Maintains state for difficulty progression and topic coverage
- Integrates sentiment analysis to refine adaptivity
- Persists incremental results and aggregates metrics

```mermaid
classDiagram
class VivaCore {
+initialize_session(params)
+next_question()
+evaluate_answer(answer)
+adjust_difficulty(metrics)
+get_feedback()
+update_report()
}
class PromptManager {
+resolve_prompt(subject, type)
+compose_context(session_state)
}
class GeminiService {
+generate(prompt, context)
+evaluate(response, rubric)
}
class SentimentAnalyzer {
+analyze(text)
}
class DeliveryMetrics {
+record(score, signals)
+aggregate()
}
class ReportService {
+persist_update(session_data)
}
VivaCore --> PromptManager : "uses"
VivaCore --> GeminiService : "calls"
VivaCore --> SentimentAnalyzer : "reads"
VivaCore --> DeliveryMetrics : "updates"
VivaCore --> ReportService : "persists"
```

**Diagram sources**
- [viva_core.py](file://backend/ai/viva_core.py)
- [prompts.py](file://backend/ai/prompts.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [report_service.py](file://backend/ai/report_service.py)

**Section sources**
- [viva_core.py](file://backend/ai/viva_core.py)
- [prompts.py](file://backend/ai/prompts.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [report_service.py](file://backend/ai/report_service.py)

### Prompt Management System
Responsibilities:
- Centralized repository of prompts by subject area and question type
- Dynamic composition with contextual variables (session state, user profile)
- Registry-based discovery and validation of prompt templates
- Versioning and fallback strategies for robustness

Integration points:
- Core orchestrator requests prompts for current step
- Code-aware module may inject code-specific context
- Reports can reference prompt versions for traceability

```mermaid
flowchart TD
Start(["Resolve Prompt"]) --> SelectSubject["Select Subject Area"]
SelectSubject --> SelectType["Select Question Type"]
SelectType --> LoadTemplate["Load Template From Registry"]
LoadTemplate --> ComposeContext["Compose Context Variables"]
ComposeContext --> Validate["Validate Template"]
Validate --> |Valid| ReturnPrompt["Return Prompt"]
Validate --> |Invalid| Fallback["Use Fallback Template"]
Fallback --> ReturnPrompt
```

**Diagram sources**
- [prompts.py](file://backend/ai/prompts.py)
- [registry.py](file://backend/ai/registry.py)

**Section sources**
- [prompts.py](file://backend/ai/prompts.py)
- [registry.py](file://backend/ai/registry.py)

### Live Session Service
Responsibilities:
- Real-time session orchestration for single or multiple participants
- Streaming question delivery and answer ingestion
- Coordination with team room state and shared artifacts
- Event-driven updates to clients

```mermaid
sequenceDiagram
participant Client as "Client"
participant LiveAPI as "Live API"
participant LiveSvc as "Live Service"
participant TeamRoom as "Team Room"
participant Core as "Viva Core"
Client->>LiveAPI : "join_session(join_code)"
LiveAPI->>LiveSvc : "create_or_join(room_id)"
LiveSvc->>TeamRoom : "sync_state()"
LiveSvc->>Core : "start_session_for_team()"
Core-->>LiveSvc : "initial_questions"
LiveSvc-->>Client : "streamed questions"
Client->>LiveAPI : "submit_answer(participant_id, answer)"
LiveAPI->>LiveSvc : "route_answer()"
LiveSvc->>Core : "evaluate_answer()"
Core-->>LiveSvc : "feedback + score"
LiveSvc-->>Client : "real-time feedback"
```

**Diagram sources**
- [live.py](file://backend/api/live.py)
- [live_service.py](file://backend/ai/live_service.py)
- [team_room.py](file://backend/ai/team_room.py)
- [viva_core.py](file://backend/ai/viva_core.py)

**Section sources**
- [live.py](file://backend/api/live.py)
- [live_service.py](file://backend/ai/live_service.py)
- [team_room.py](file://backend/ai/team_room.py)
- [viva_core.py](file://backend/ai/viva_core.py)

### Code-Aware Viva Extension
Responsibilities:
- Ingests code snippets and execution metadata
- Generates code-focused questions and evaluates responses against rubrics
- Produces domain-specific feedback and hints

Integration:
- Uses core orchestrator for session control
- Leverages external LLM for code understanding and evaluation

```mermaid
classDiagram
class CodeAwareViva {
+ingest_code(code_meta)
+generate_code_question()
+evaluate_code_response(response)
+provide_hints()
}
class VivaCore
class GeminiService
CodeAwareViva --> VivaCore : "delegates session flow"
CodeAwareViva --> GeminiService : "code evaluation"
```

**Diagram sources**
- [code_aware_viva.py](file://backend/ai/code_aware_viva.py)
- [viva_core.py](file://backend/ai/viva_core.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)

**Section sources**
- [code_aware_viva.py](file://backend/ai/code_aware_viva.py)
- [viva_core.py](file://backend/ai/viva_core.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)

### Sentiment Analysis and Adaptive Difficulty
Responsibilities:
- Analyzes textual responses for tone and confidence indicators
- Feeds sentiment signals into adaptive difficulty adjustments
- Helps tailor follow-up questions to reinforce weak areas

```mermaid
flowchart TD
A["Receive Answer Text"] --> B["Analyze Sentiment"]
B --> C{"Confidence Low?"}
C --> |Yes| D["Lower Difficulty / Provide Hint"]
C --> |No| E["Maintain or Increase Difficulty"]
D --> F["Update Metrics"]
E --> F
F --> G["Persist Update"]
```

**Diagram sources**
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [viva_core.py](file://backend/ai/viva_core.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)

**Section sources**
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [viva_core.py](file://backend/ai/viva_core.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)

### Metrics, Heatmaps, and Reporting
Responsibilities:
- Track delivery performance and session outcomes
- Generate weakness heatmaps to visualize knowledge gaps
- Aggregate and persist reports for review and analytics

```mermaid
classDiagram
class DeliveryMetrics {
+record_event(event)
+compute_aggregates()
}
class WeaknessHeatmap {
+build_heatmap(session_data)
+export_visualization()
}
class ReportService {
+compile_report(session_id)
+save_report(report)
}
DeliveryMetrics --> WeaknessHeatmap : "feeds data"
DeliveryMetrics --> ReportService : "provides metrics"
```

**Diagram sources**
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [report_service.py](file://backend/ai/report_service.py)

**Section sources**
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [report_service.py](file://backend/ai/report_service.py)

### Team Live Service and Room State
Responsibilities:
- Coordinate multi-participant sessions
- Maintain shared room state and synchronization
- Route answers and feedback per participant while preserving group coherence

```mermaid
sequenceDiagram
participant Host as "Host Client"
participant Member as "Member Client"
participant TeamLive as "Team Live Service"
participant Room as "Team Room"
participant Core as "Viva Core"
Host->>TeamLive : "initiate_team_session()"
TeamLive->>Room : "create_room()"
Member->>TeamLive : "join_room(join_code)"
TeamLive->>Core : "start_session_for_team()"
Core-->>TeamLive : "shared questions"
TeamLive-->>Host : "broadcast initial state"
Member->>TeamLive : "submit_answer()"
TeamLive->>Core : "evaluate_answer(member_id, answer)"
Core-->>TeamLive : "member feedback"
TeamLive-->>Member : "personalized feedback"
TeamLive-->>Host : "room-wide summary"
```

**Diagram sources**
- [team_live_service.py](file://backend/ai/team_live_service.py)
- [team_room.py](file://backend/ai/team_room.py)
- [viva_core.py](file://backend/ai/viva_core.py)

**Section sources**
- [team_live_service.py](file://backend/ai/team_live_service.py)
- [team_room.py](file://backend/ai/team_room.py)
- [viva_core.py](file://backend/ai/viva_core.py)

## Dependency Analysis
The engine exhibits clear separation between API, core orchestration, domain extensions, and analytics. Dependencies are primarily unidirectional:
- API depends on AI services
- Core depends on prompt manager, LLM service, sentiment analyzer, metrics, and reporting
- Code-aware and team features extend core without circular dependencies

```mermaid
graph LR
API["API Layer"] --> Core["Viva Core"]
Core --> Prompts["Prompt Manager"]
Core --> LLM["Gemini Service"]
Core --> Sent["Sentiment Analyzer"]
Core --> Metrics["Delivery Metrics"]
Core --> Report["Report Service"]
CodeAware["Code-Aware Viva"] --> Core
TeamLive["Team Live Service"] --> Core
TeamLive --> Room["Team Room"]
```

**Diagram sources**
- [viva.py](file://backend/api/viva.py)
- [live.py](file://backend/api/live.py)
- [viva_core.py](file://backend/ai/viva_core.py)
- [prompts.py](file://backend/ai/prompts.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [report_service.py](file://backend/ai/report_service.py)
- [code_aware_viva.py](file://backend/ai/code_aware_viva.py)
- [team_live_service.py](file://backend/ai/team_live_service.py)
- [team_room.py](file://backend/ai/team_room.py)

**Section sources**
- [viva.py](file://backend/api/viva.py)
- [live.py](file://backend/api/live.py)
- [viva_core.py](file://backend/ai/viva_core.py)
- [prompts.py](file://backend/ai/prompts.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)
- [sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [report_service.py](file://backend/ai/report_service.py)
- [code_aware_viva.py](file://backend/ai/code_aware_viva.py)
- [team_live_service.py](file://backend/ai/team_live_service.py)
- [team_room.py](file://backend/ai/team_room.py)

## Performance Considerations
- Batch operations: Group metric updates and report writes to reduce I/O overhead.
- Streaming responses: Use server-sent events or WebSocket streams for low-latency feedback.
- Prompt caching: Cache resolved prompts and frequently used contexts to minimize recomputation.
- Model call optimization: Implement retry/backoff and request coalescing for LLM calls.
- Concurrency control: Limit parallel evaluations per session to prevent resource contention.
- Memory management: Stream large artifacts (e.g., code diffs) and avoid retaining full transcripts indefinitely.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- LLM failures: Inspect error codes and implement retries with exponential backoff. Check rate limits and quota usage.
- Prompt resolution errors: Validate registry entries and ensure required variables are present in session context.
- Sentiment analysis anomalies: Normalize input text and handle edge cases like very short responses.
- Live session sync conflicts: Ensure idempotent event processing and conflict resolution strategies in team room state.
- Metric inconsistencies: Verify event ordering and deduplication before aggregation.

Operational references:
- Error definitions and handling patterns
- Configuration toggles for logging and diagnostics
- Schema contracts for request/response payloads

**Section sources**
- [errors.py](file://backend/core/errors.py)
- [config.py](file://backend/core/config.py)
- [schemas.py](file://backend/models/schemas.py)

## Conclusion
The Viva Core Engine provides a robust, extensible foundation for AI-powered examinations. Its modular design enables easy integration of new subjects, question types, and evaluation algorithms. With strong support for real-time interaction, adaptive difficulty, and comprehensive analytics, it delivers immediate, actionable feedback to learners and instructors alike.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Configuration Options
- Exam parameters: number of questions, time limits, topic coverage weights
- Scoring mechanisms: rubric weights, penalty rules, pass thresholds
- Performance metrics: latency targets, throughput goals, error budgets
- Feature flags: enable/disable sentiment analysis, code-aware mode, team features

**Section sources**
- [config.py](file://backend/core/config.py)

### Integration Examples
- Adding a new subject domain:
  - Register new prompt templates and registry entries
  - Extend core orchestrator to recognize subject-specific question types
  - Provide custom evaluation rubrics and feedback generators
- Modifying evaluation algorithms:
  - Swap or augment LLM evaluators via the gemini service interface
  - Integrate additional signals (e.g., code execution results) into scoring
- Extending capabilities:
  - Implement new domain adapters (similar to code-aware viva)
  - Add analytics dashboards by consuming metrics and heatmap outputs

**Section sources**
- [prompts.py](file://backend/ai/prompts.py)
- [registry.py](file://backend/ai/registry.py)
- [viva_core.py](file://backend/ai/viva_core.py)
- [code_aware_viva.py](file://backend/ai/code_aware_viva.py)
- [gemini_service.py](file://backend/ai/gemini_service.py)
- [delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)