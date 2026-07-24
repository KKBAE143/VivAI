# Performance Analytics & Reporting

<cite>
**Referenced Files in This Document**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/ai/report_service.py](file://backend/ai/report_service.py)
- [backend/ai/delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [backend/ai/sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [backend/ai/weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [backend/core/database.py](file://backend/core/database.py)
- [backend/models/schemas.py](file://backend/models/schemas.py)
- [src/components/reports/session-report.tsx](file://src/components/reports/session-report.tsx)
- [src/components/ui/chart.tsx](file://src/components/ui/chart.tsx)
- [src/routes/advanced/weakness-heatmap.tsx](file://src/routes/advanced/weakness-heatmap.tsx)
- [src/routes/advanced/sentiment-analysis.tsx](file://src/routes/advanced/sentiment-analysis.tsx)
- [src/lib/api.ts](file://src/lib/api.ts)
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
This document explains the performance analytics and reporting system that transforms examination data into actionable insights. It covers:
- Metrics collection framework for response times, accuracy rates, and learning progression indicators
- Report generation algorithms producing comprehensive summaries, skill assessments, and improvement recommendations
- Visualization components and data export capabilities for stakeholders
- Examples of custom report templates, analytical dashboards, and integration with external learning management systems (LMS)
- Data privacy considerations and anonymization techniques used in reporting

The system is implemented as a backend API with AI-powered analysis services and a frontend dashboard for visualization and export.

## Project Structure
The analytics and reporting functionality spans backend APIs, AI services, database access, models, and frontend visualization routes and components.

```mermaid
graph TB
subgraph "Frontend"
FE_Report["Session Report<br/>src/components/reports/session-report.tsx"]
FE_Heatmap["Weakness Heatmap Route<br/>src/routes/advanced/weakness-heatmap.tsx"]
FE_Sentiment["Sentiment Analysis Route<br/>src/routes/advanced/sentiment-analysis.tsx"]
FE_Charts["Chart UI<br/>src/components/ui/chart.tsx"]
FE_API["API Client<br/>src/lib/api.ts"]
end
subgraph "Backend"
BE_Analytics["Analytics API<br/>backend/api/analytics.py"]
BE_ReportSvc["Report Service (AI)<br/>backend/ai/report_service.py"]
BE_Delivery["Delivery Metrics (AI)<br/>backend/ai/delivery_metrics.py"]
BE_Sentiment["Sentiment Analyzer (AI)<br/>backend/ai/sentiment_analyzer.py"]
BE_Heatmap["Weakness Heatmap (AI)<br/>backend/ai/weakness_heatmap.py"]
BE_DB["Database Access<br/>backend/core/database.py"]
BE_Schemas["Schemas<br/>backend/models/schemas.py"]
end
FE_Report --> FE_API
FE_Heatmap --> FE_API
FE_Sentiment --> FE_API
FE_API --> BE_Analytics
BE_Analytics --> BE_ReportSvc
BE_Analytics --> BE_Delivery
BE_Analytics --> BE_Sentiment
BE_Analytics --> BE_Heatmap
BE_Analytics --> BE_DB
BE_Analytics --> BE_Schemas
```

**Diagram sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/ai/report_service.py](file://backend/ai/report_service.py)
- [backend/ai/delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [backend/ai/sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [backend/ai/weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [backend/core/database.py](file://backend/core/database.py)
- [backend/models/schemas.py](file://backend/models/schemas.py)
- [src/components/reports/session-report.tsx](file://src/components/reports/session-report.tsx)
- [src/routes/advanced/weakness-heatmap.tsx](file://src/routes/advanced/weakness-heatmap.tsx)
- [src/routes/advanced/sentiment-analysis.tsx](file://src/routes/advanced/sentiment-analysis.tsx)
- [src/components/ui/chart.tsx](file://src/components/ui/chart.tsx)
- [src/lib/api.ts](file://src/lib/api.ts)

**Section sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/ai/report_service.py](file://backend/ai/report_service.py)
- [backend/ai/delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [backend/ai/sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [backend/ai/weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [backend/core/database.py](file://backend/core/database.py)
- [backend/models/schemas.py](file://backend/models/schemas.py)
- [src/components/reports/session-report.tsx](file://src/components/reports/session-report.tsx)
- [src/routes/advanced/weakness-heatmap.tsx](file://src/routes/advanced/weakness-heatmap.tsx)
- [src/routes/advanced/sentiment-analysis.tsx](file://src/routes/advanced/sentiment-analysis.tsx)
- [src/components/ui/chart.tsx](file://src/components/ui/chart.tsx)
- [src/lib/api.ts](file://src/lib/api.ts)

## Core Components
- Analytics API: Orchestrates requests to collect metrics, generate reports, and serve visualizations.
- AI Report Service: Produces comprehensive performance summaries, skill assessments, and improvement recommendations using AI-driven logic.
- Delivery Metrics: Computes delivery-related performance indicators such as pacing, fluency, and confidence proxies.
- Sentiment Analyzer: Analyzes tone and sentiment from session transcripts or responses to enrich insights.
- Weakness Heatmap: Identifies knowledge gaps and patterns across topics and sessions.
- Database Access: Provides persistence and retrieval of raw and aggregated metrics.
- Schemas: Defines request/response contracts and internal data structures.
- Frontend Reports and Dashboards: Renders charts, heatmaps, and narrative summaries; supports export.

Key responsibilities:
- Metrics collection: Response time tracking, accuracy computation, and learning progression indicators
- Report generation: Summaries, skill assessments, and recommendations
- Visualization: Charts, heatmaps, and narrative panels
- Export: CSV/JSON exports for stakeholder consumption
- Privacy: Anonymization and aggregation before exposure

**Section sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/ai/report_service.py](file://backend/ai/report_service.py)
- [backend/ai/delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [backend/ai/sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [backend/ai/weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [backend/core/database.py](file://backend/core/database.py)
- [backend/models/schemas.py](file://backend/models/schemas.py)
- [src/components/reports/session-report.tsx](file://src/components/reports/session-report.tsx)
- [src/routes/advanced/weakness-heatmap.tsx](file://src/routes/advanced/weakness-heatmap.tsx)
- [src/routes/advanced/sentiment-analysis.tsx](file://src/routes/advanced/sentiment-analysis.tsx)
- [src/components/ui/chart.tsx](file://src/components/ui/chart.tsx)
- [src/lib/api.ts](file://src/lib/api.ts)

## Architecture Overview
The system follows a layered architecture:
- Presentation layer: React-based dashboards and report views
- API layer: FastAPI endpoints aggregating analytics and report generation
- Services layer: AI-powered modules for metrics, sentiment, and heatmap analysis
- Data layer: Database access and schema definitions

```mermaid
sequenceDiagram
participant User as "User"
participant FE as "Frontend Dashboard"
participant API as "Analytics API"
participant RS as "Report Service"
participant DM as "Delivery Metrics"
participant SA as "Sentiment Analyzer"
participant WH as "Weakness Heatmap"
participant DB as "Database"
User->>FE : Open "Performance Report"
FE->>API : GET /analytics/report?session_id=...
API->>DB : Fetch session data and metrics
DB-->>API : Raw metrics and logs
API->>RS : Generate summary and recommendations
API->>DM : Compute delivery metrics
API->>SA : Analyze sentiment
API->>WH : Build weakness heatmap
RS-->>API : Summary + Recommendations
DM-->>API : Delivery scores
SA-->>API : Sentiment insights
WH-->>API : Heatmap data
API-->>FE : Aggregated report payload
FE->>FE : Render charts and narrative
```

**Diagram sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/ai/report_service.py](file://backend/ai/report_service.py)
- [backend/ai/delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [backend/ai/sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [backend/ai/weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [backend/core/database.py](file://backend/core/database.py)

## Detailed Component Analysis

### Analytics API
Responsibilities:
- Expose endpoints for report generation, metric queries, and export
- Aggregate results from AI services and database
- Enforce input validation via schemas
- Apply anonymization and aggregation rules before returning data

```mermaid
classDiagram
class AnalyticsAPI {
+get_report(session_id)
+get_metrics(filters)
+export_csv(report_id)
+export_json(report_id)
}
class ReportService {
+generate_summary(data)
+assess_skills(data)
+recommend_improvements(data)
}
class DeliveryMetrics {
+compute_pacing(logs)
+compute_fluency(transcript)
+confidence_proxy(metrics)
}
class SentimentAnalyzer {
+analyze_tone(text)
+aggregate_sentiment(session)
}
class WeaknessHeatmap {
+build_heatmap(topic_scores)
+identify_gaps(scores)
}
class Database {
+fetch_session(session_id)
+query_metrics(filters)
}
class Schemas {
+ReportRequest
+MetricFilter
+ExportFormat
}
AnalyticsAPI --> ReportService : "uses"
AnalyticsAPI --> DeliveryMetrics : "uses"
AnalyticsAPI --> SentimentAnalyzer : "uses"
AnalyticsAPI --> WeaknessHeatmap : "uses"
AnalyticsAPI --> Database : "reads/writes"
AnalyticsAPI --> Schemas : "validates"
```

**Diagram sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/ai/report_service.py](file://backend/ai/report_service.py)
- [backend/ai/delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [backend/ai/sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [backend/ai/weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [backend/core/database.py](file://backend/core/database.py)
- [backend/models/schemas.py](file://backend/models/schemas.py)

**Section sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/models/schemas.py](file://backend/models/schemas.py)

### Report Generation Algorithms
Capabilities:
- Comprehensive performance summaries combining accuracy, response time, and sentiment
- Skill assessments mapping performance to topic-level competencies
- Improvement recommendations derived from weakness detection and trends

```mermaid
flowchart TD
Start(["Start Report Generation"]) --> LoadData["Load Session Data and Logs"]
LoadData --> ComputeAccuracy["Compute Accuracy Rates"]
LoadData --> ComputeResponseTime["Aggregate Response Times"]
LoadData --> Sentiment["Run Sentiment Analysis"]
ComputeAccuracy --> AssessSkills["Assess Skills by Topic"]
ComputeResponseTime --> AssessSkills
Sentiment --> AssessSkills
AssessSkills --> IdentifyGaps["Identify Knowledge Gaps"]
IdentifyGaps --> GenerateRecs["Generate Improvement Recommendations"]
GenerateRecs --> CompileSummary["Compile Summary and Insights"]
CompileSummary --> End(["Return Report"])
```

**Diagram sources**
- [backend/ai/report_service.py](file://backend/ai/report_service.py)
- [backend/ai/sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [backend/ai/weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)

**Section sources**
- [backend/ai/report_service.py](file://backend/ai/report_service.py)
- [backend/ai/sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [backend/ai/weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)

### Metrics Collection Framework
Focus areas:
- Response times: Latency per question, average latency, percentiles
- Accuracy rates: Correct vs incorrect answers, topic-wise accuracy
- Learning progression indicators: Trending accuracy over time, gap closure rate

```mermaid
flowchart TD
MStart(["Collect Metrics"]) --> CaptureLogs["Capture Session Logs"]
CaptureLogs --> ExtractRT["Extract Response Times"]
CaptureLogs --> ExtractAnswers["Extract Answers and Ground Truth"]
ExtractRT --> RTAgg["Aggregate Latency Stats"]
ExtractAnswers --> AccCalc["Compute Accuracy per Topic"]
AccCalc --> Progression["Compute Progression Trends"]
RTAgg --> Combine["Combine Metrics"]
Progression --> Combine
Combine --> Persist["Persist to Database"]
Persist --> MEnd(["Ready for Reporting"])
```

**Diagram sources**
- [backend/ai/delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [backend/core/database.py](file://backend/core/database.py)

**Section sources**
- [backend/ai/delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [backend/core/database.py](file://backend/core/database.py)

### Visualization Components
Frontend features:
- Session report view rendering narrative summaries and key metrics
- Chart components for time series, bar charts, and gauges
- Weakness heatmap route displaying topic-level gaps
- Sentiment analysis route showing tone distribution

```mermaid
graph LR
FE_Report["Session Report View<br/>src/components/reports/session-report.tsx"] --> FE_Charts["Chart UI<br/>src/components/ui/chart.tsx"]
FE_Heatmap["Weakness Heatmap Route<br/>src/routes/advanced/weakness-heatmap.tsx"] --> FE_Charts
FE_Sentiment["Sentiment Analysis Route<br/>src/routes/advanced/sentiment-analysis.tsx"] --> FE_Charts
FE_Report --> FE_API["API Client<br/>src/lib/api.ts"]
FE_Heatmap --> FE_API
FE_Sentiment --> FE_API
```

**Diagram sources**
- [src/components/reports/session-report.tsx](file://src/components/reports/session-report.tsx)
- [src/components/ui/chart.tsx](file://src/components/ui/chart.tsx)
- [src/routes/advanced/weakness-heatmap.tsx](file://src/routes/advanced/weakness-heatmap.tsx)
- [src/routes/advanced/sentiment-analysis.tsx](file://src/routes/advanced/sentiment-analysis.tsx)
- [src/lib/api.ts](file://src/lib/api.ts)

**Section sources**
- [src/components/reports/session-report.tsx](file://src/components/reports/session-report.tsx)
- [src/components/ui/chart.tsx](file://src/components/ui/chart.tsx)
- [src/routes/advanced/weakness-heatmap.tsx](file://src/routes/advanced/weakness-heatmap.tsx)
- [src/routes/advanced/sentiment-analysis.tsx](file://src/routes/advanced/sentiment-analysis.tsx)
- [src/lib/api.ts](file://src/lib/api.ts)

### Data Export Capabilities
Exports support:
- CSV and JSON formats for stakeholder consumption
- Filtered datasets based on date ranges, topics, and session types
- Anonymized payloads suitable for sharing outside the platform

Typical flow:
- Request export with filters
- Backend aggregates and anonymizes data
- Return downloadable file or stream

```mermaid
sequenceDiagram
participant User as "User"
participant FE as "Frontend"
participant API as "Analytics API"
participant DB as "Database"
User->>FE : Click "Export CSV"
FE->>API : POST /analytics/export/csv {filters}
API->>DB : Query filtered metrics
DB-->>API : Dataset
API->>API : Anonymize and aggregate
API-->>FE : File stream
FE-->>User : Download CSV
```

**Diagram sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/core/database.py](file://backend/core/database.py)

**Section sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/core/database.py](file://backend/core/database.py)

### Custom Report Templates
Templates enable:
- Tailored layouts for different audiences (instructors, learners, administrators)
- Configurable sections: executive summary, skill breakdown, recommendations
- Branding and language customization

Template structure example:
- Header: Title, date range, audience
- Sections: Key metrics, charts, narrative insights, action items
- Footer: Disclaimers, anonymization notice

[No sources needed since this section provides conceptual guidance]

### Analytical Dashboards
Dashboards provide:
- Real-time overview of session performance
- Drill-down by topic, learner, or team
- Trend lines for progression indicators
- Alerts for anomalies or significant drops

[No sources needed since this section provides conceptual guidance]

### Integration with External LMS
Integration points:
- Ingest exam results and metadata from LMS via secure endpoints
- Push analytics back to LMS gradebooks or portfolios
- Support single sign-on and role-based access

Example workflow:
- LMS sends batch of exam records
- Backend validates and stores anonymized records
- Analytics pipeline computes metrics and updates dashboards
- LMS polls for updated scores or receives webhooks

[No sources needed since this section provides conceptual guidance]

### Data Privacy and Anonymization
Privacy measures:
- Remove direct identifiers before export or sharing
- Aggregate at cohort or topic level when required
- Retain only necessary fields for analysis
- Provide audit trails for data access and transformations

Anonymization steps:
- Strip names, IDs, and contact info
- Hash or generalize timestamps where not essential
- Ensure k-anonymity thresholds for small groups

**Section sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/core/database.py](file://backend/core/database.py)

## Dependency Analysis
Component relationships and coupling:
- Analytics API depends on AI services and database
- AI services depend on schemas and database
- Frontend depends on API client and chart components

```mermaid
graph TB
API["Analytics API"] --> RS["Report Service"]
API --> DM["Delivery Metrics"]
API --> SA["Sentiment Analyzer"]
API --> WH["Weakness Heatmap"]
API --> DB["Database"]
API --> SC["Schemas"]
FE["Frontend"] --> API
FE --> CH["Charts"]
```

**Diagram sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/ai/report_service.py](file://backend/ai/report_service.py)
- [backend/ai/delivery_metrics.py](file://backend/ai/delivery_metrics.py)
- [backend/ai/sentiment_analyzer.py](file://backend/ai/sentiment_analyzer.py)
- [backend/ai/weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [backend/core/database.py](file://backend/core/database.py)
- [backend/models/schemas.py](file://backend/models/schemas.py)
- [src/components/ui/chart.tsx](file://src/components/ui/chart.tsx)
- [src/lib/api.ts](file://src/lib/api.ts)

**Section sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/models/schemas.py](file://backend/models/schemas.py)
- [src/lib/api.ts](file://src/lib/api.ts)

## Performance Considerations
- Batch processing for large datasets to avoid timeouts
- Caching frequently accessed aggregated metrics
- Indexing database tables by session_id, topic, and timestamp
- Streaming exports for large files
- Asynchronous report generation for heavy computations

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing session data: Verify session_id and permissions
- Slow report generation: Check database indexes and cache hits
- Export failures: Validate filters and ensure sufficient privileges
- Visualization errors: Confirm data shape matches expected schema

Debugging tips:
- Enable detailed logging around API entry points
- Inspect intermediate outputs from AI services
- Validate schema compliance for inputs and outputs

**Section sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/core/database.py](file://backend/core/database.py)

## Conclusion
The performance analytics and reporting system integrates robust metrics collection, AI-driven report generation, and rich visualizations to deliver actionable insights. With strong privacy safeguards and flexible export options, it serves diverse stakeholders while maintaining data integrity and usability.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Example: Generating a Performance Summary
Steps:
- Request report with session filters
- Backend computes accuracy, response times, sentiment, and weaknesses
- Frontend renders summary and recommendations

[No sources needed since this section provides conceptual guidance]

### Example: Building a Weakness Heatmap
Steps:
- Collect topic-level scores across sessions
- Aggregate and normalize scores
- Render heatmap highlighting gaps

**Section sources**
- [backend/ai/weakness_heatmap.py](file://backend/ai/weakness_heatmap.py)
- [src/routes/advanced/weakness-heatmap.tsx](file://src/routes/advanced/weakness-heatmap.tsx)

### Example: Exporting an Anonymized Dataset
Steps:
- Define filters (date range, topics)
- Backend aggregates and removes identifiers
- Download CSV/JSON for further analysis

**Section sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/core/database.py](file://backend/core/database.py)