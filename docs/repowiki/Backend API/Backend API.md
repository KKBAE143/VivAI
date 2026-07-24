# Backend API

<cite>
**Referenced Files in This Document**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)
- [errors.py](file://backend/core/errors.py)
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)
- [templates.py](file://backend/api/templates.py)
- [catalog.py](file://backend/api/catalog.py)
- [files.py](file://backend/api/files.py)
- [live.py](file://backend/api/live.py)
- [team_live.py](file://backend/api/team_live.py)
- [viva.py](file://backend/api/viva.py)
- [advanced.py](file://backend/api/advanced.py)
- [analytics.py](file://backend/api/analytics.py)
- [presentation.py](file://backend/api/presentation.py)
- [project_team.py](file://backend/api/project_team.py)
- [readiness.py](file://backend/api/readiness.py)
- [gamification.py](file://backend/api/gamification.py)
- [schemas.py](file://backend/models/schemas.py)
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [001_platform_enhancement.sql](file://backend/migrations/001_platform_enhancement.sql)
- [002_quality_upgrade.sql](file://backend/migrations/002_quality_upgrade.sql)
- [003_team_project_linking.sql](file://backend/migrations/003_team_project_linking.sql)
- [004_team_viva_voice.sql](file://backend/migrations/004_team_viva_voice.sql)
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
This document provides comprehensive API documentation for the Horux backend built with FastAPI. It covers RESTful endpoint organization, request/response patterns, authentication and authorization, dependency injection, middleware stack, service layer abstraction, database integration with SQLAlchemy and Supabase PostgreSQL, security measures (JWT, RBAC, input validation, CORS), API versioning strategies, rate limiting, monitoring, and detailed endpoint specifications with schemas and usage examples.

## Project Structure
The backend is organized into clear layers:
- Entry point and application configuration
- Core utilities (configuration, database, dependencies, errors, logging, languages)
- API routes grouped by domain (auth, projects, teams, tasks, templates, catalog, files, live sessions, viva, analytics, presentation, project-team linking, readiness, gamification, advanced features)
- Data models and Pydantic schemas
- Database schema and migrations
- Services for business logic
- Tests for core functionality

```mermaid
graph TB
A["FastAPI App<br/>main.py"] --> B["Core Config<br/>core/config.py"]
A --> C["Database Setup<br/>core/database.py"]
A --> D["Dependencies<br/>core/deps.py"]
A --> E["Error Handling<br/>core/errors.py"]
A --> F["API Routes<br/>api/*"]
F --> G["Schemas<br/>models/schemas.py"]
C --> H["Supabase PostgreSQL<br/>supabase_schema.sql"]
C --> I["Migrations<br/>migrations/*.sql"]
```

**Diagram sources**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)
- [errors.py](file://backend/core/errors.py)
- [schemas.py](file://backend/models/schemas.py)
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [001_platform_enhancement.sql](file://backend/migrations/001_platform_enhancement.sql)
- [002_quality_upgrade.sql](file://backend/migrations/002_quality_upgrade.sql)
- [003_team_project_linking.sql](file://backend/migrations/003_team_project_linking.sql)
- [004_team_viva_voice.sql](file://backend/migrations/004_team_viva_voice.sql)

**Section sources**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)
- [errors.py](file://backend/core/errors.py)
- [schemas.py](file://backend/models/schemas.py)
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [001_platform_enhancement.sql](file://backend/migrations/001_platform_enhancement.sql)
- [002_quality_upgrade.sql](file://backend/migrations/002_quality_upgrade.sql)
- [003_team_project_linking.sql](file://backend/migrations/003_team_project_linking.sql)
- [004_team_viva_voice.sql](file://backend/migrations/004_team_viva_voice.sql)

## Core Components
- Application entrypoint and middleware setup
- Configuration management for environment variables and feature flags
- Database engine, session factory, and connection pooling
- Dependency injection providers for DB sessions, auth context, and services
- Centralized error handling and HTTP exception responses
- Pydantic schemas for request/response validation and serialization

Key responsibilities:
- Initialize FastAPI app with CORS, middleware, routers
- Provide typed configuration via environment variables
- Manage SQLAlchemy engine/session lifecycle and pool settings
- Expose reusable dependencies to route handlers
- Define consistent error shapes and status codes
- Validate and serialize payloads using Pydantic models

**Section sources**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)
- [errors.py](file://backend/core/errors.py)
- [schemas.py](file://backend/models/schemas.py)

## Architecture Overview
The system follows a layered architecture:
- Presentation Layer: FastAPI routers define REST endpoints
- Service Layer: Business logic encapsulated in Python modules
- Data Access Layer: SQLAlchemy ORM with Supabase PostgreSQL
- Security Layer: JWT-based authentication and role-based access control
- Cross-cutting concerns: Logging, error handling, validation, rate limiting

```mermaid
graph TB
Client["Client Apps"] --> Router["FastAPI Routers<br/>api/*"]
Router --> DI["Dependency Injection<br/>core/deps.py"]
Router --> Auth["Auth Middleware<br/>JWT + RBAC"]
Router --> Svc["Service Layer<br/>services/*"]
Svc --> DAO["Data Access<br/>SQLAlchemy ORM"]
DAO --> DB["Supabase PostgreSQL<br/>Connection Pool"]
Router --> Err["Error Handler<br/>core/errors.py"]
Router --> Log["Logging<br/>core/logging.py"]
```

**Diagram sources**
- [auth.py](file://backend/api/auth.py)
- [deps.py](file://backend/core/deps.py)
- [database.py](file://backend/core/database.py)
- [errors.py](file://backend/core/errors.py)
- [supabase_schema.sql](file://backend/supabase_schema.sql)

## Detailed Component Analysis

### Authentication and Authorization
- JWT-based token issuance and verification
- Role-based access control enforced at route or service level
- Secure cookie or header transport options
- Refresh token flow and token expiration handling

```mermaid
sequenceDiagram
participant Client as "Client"
participant Auth as "Auth Endpoint<br/>api/auth.py"
participant Service as "AuthService"
participant DB as "DB Session"
participant Token as "JWT Manager"
Client->>Auth : POST /auth/login {email, password}
Auth->>Service : authenticate(email, password)
Service->>DB : find_user_by_email()
DB-->>Service : User record
Service->>Token : create_access_token(user)
Token-->>Service : {access_token, refresh_token}
Service-->>Auth : AuthResponse
Auth-->>Client : 200 OK {tokens}
```

**Diagram sources**
- [auth.py](file://backend/api/auth.py)
- [deps.py](file://backend/core/deps.py)
- [database.py](file://backend/core/database.py)

**Section sources**
- [auth.py](file://backend/api/auth.py)
- [deps.py](file://backend/core/deps.py)

### Projects API
- CRUD operations for projects
- Team association and permissions
- Template-driven project creation
- Versioned endpoints for backward compatibility

```mermaid
classDiagram
class ProjectController {
+create_project(data) Project
+get_project(id) Project
+update_project(id, data) Project
+delete_project(id) bool
+list_projects(filters) Project[]
}
class ProjectService {
+validate_permissions(user, project) bool
+enrich_project(project) Project
}
class ProjectSchema {
+id uuid
+title string
+description string
+owner_id uuid
+team_ids uuid[]
+status enum
+created_at datetime
+updated_at datetime
}
ProjectController --> ProjectService : "uses"
ProjectController --> ProjectSchema : "validates/serializes"
```

**Diagram sources**
- [projects.py](file://backend/api/projects.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [projects.py](file://backend/api/projects.py)
- [schemas.py](file://backend/models/schemas.py)

### Teams API
- Team creation, membership management
- Role assignment within teams
- Team-scoped resource access

```mermaid
flowchart TD
Start(["Request /teams"]) --> Validate["Validate Payload"]
Validate --> CheckRole{"User has admin role?"}
CheckRole --> |No| Deny["Return 403 Forbidden"]
CheckRole --> |Yes| CreateTeam["Create Team Record"]
CreateTeam --> AddMember["Add Creator as Member"]
AddMember --> Return201["Return 201 Created"]
Deny --> End(["Exit"])
Return201 --> End
```

**Diagram sources**
- [teams.py](file://backend/api/teams.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [teams.py](file://backend/api/teams.py)
- [schemas.py](file://backend/models/schemas.py)

### Tasks API
- Task lifecycle management
- Reordering and status transitions
- Assignment to users and teams

```mermaid
sequenceDiagram
participant Client as "Client"
participant Tasks as "Tasks Endpoint<br/>api/tasks.py"
participant Service as "TaskService"
participant DB as "DB Session"
Client->>Tasks : PATCH /tasks/{id}/status {status}
Tasks->>Service : update_task_status(id, status)
Service->>DB : get_task_by_id(id)
DB-->>Service : Task
Service->>Service : validate_transition(current, target)
Service->>DB : save_task(task)
Service-->>Tasks : Updated Task
Tasks-->>Client : 200 OK {task}
```

**Diagram sources**
- [tasks.py](file://backend/api/tasks.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [tasks.py](file://backend/api/tasks.py)
- [schemas.py](file://backend/models/schemas.py)

### Templates API
- Template listing and retrieval
- Slug-based template resolution
- Versioned template content

```mermaid
classDiagram
class TemplateController {
+list_templates() Template[]
+get_template(slug) Template
+render_template(slug, context) string
}
class TemplateService {
+resolve_template(slug) Template
+apply_context(template, context) string
}
class TemplateSchema {
+slug string
+title string
+content string
+version int
+metadata map
}
TemplateController --> TemplateService : "uses"
TemplateController --> TemplateSchema : "validates/serializes"
```

**Diagram sources**
- [templates.py](file://backend/api/templates.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [templates.py](file://backend/api/templates.py)
- [schemas.py](file://backend/models/schemas.py)

### Catalog API
- Resource catalog management
- Filtering and search capabilities
- Metadata enrichment

```mermaid
flowchart TD
Request["GET /catalog?query=&category="] --> Parse["Parse Query Params"]
Parse --> BuildQuery["Build SQL Query"]
BuildQuery --> Execute["Execute Query"]
Execute --> Results{"Results Found?"}
Results --> |No| Empty["Return []"]
Results --> |Yes| Enrich["Enrich with Metadata"]
Enrich --> Serialize["Serialize Response"]
Serialize --> Return["Return 200 OK"]
Empty --> Return
```

**Diagram sources**
- [catalog.py](file://backend/api/catalog.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [catalog.py](file://backend/api/catalog.py)
- [schemas.py](file://backend/models/schemas.py)

### Files API
- File upload and download
- Signed URL generation
- Content type validation

```mermaid
sequenceDiagram
participant Client as "Client"
participant Files as "Files Endpoint<br/>api/files.py"
participant Storage as "Storage Service"
participant DB as "DB Session"
Client->>Files : POST /files/upload {file, metadata}
Files->>Storage : validate_and_store(file)
Storage-->>Files : file_url
Files->>DB : persist_file_metadata(file_url, metadata)
DB-->>Files : FileRecord
Files-->>Client : 201 Created {file_url, id}
```

**Diagram sources**
- [files.py](file://backend/api/files.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [files.py](file://backend/api/files.py)
- [schemas.py](file://backend/models/schemas.py)

### Live Sessions API
- Real-time session management
- WebSocket support for live interactions
- Session state persistence

```mermaid
classDiagram
class LiveSessionController {
+create_session(team_id) Session
+join_session(session_id, user_id) bool
+end_session(session_id) bool
+get_session_state(session_id) SessionState
}
class LiveSessionService {
+initialize_session(team_id) Session
+handle_join(session_id, user_id) bool
+persist_state(session_id, state) bool
}
class SessionSchema {
+id uuid
+team_id uuid
+state map
+participants uuid[]
+created_at datetime
+updated_at datetime
}
LiveSessionController --> LiveSessionService : "uses"
LiveSessionController --> SessionSchema : "validates/serializes"
```

**Diagram sources**
- [live.py](file://backend/api/live.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [live.py](file://backend/api/live.py)
- [schemas.py](file://backend/models/schemas.py)

### Team Live API
- Multi-user live collaboration
- Real-time event broadcasting
- Conflict resolution for concurrent updates

```mermaid
flowchart TD
Event["Live Event Received"] --> Validate["Validate Event Schema"]
Validate --> Broadcast["Broadcast to Participants"]
Broadcast --> Persist["Persist Event State"]
Persist --> Acknowledge["Acknowledge to Sender"]
Acknowledge --> Complete["Complete Processing"]
```

**Diagram sources**
- [team_live.py](file://backend/api/team_live.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [team_live.py](file://backend/api/team_live.py)
- [schemas.py](file://backend/models/schemas.py)

### Viva API
- AI-powered viva session management
- Prompt generation and execution
- Session analytics and reporting

```mermaid
sequenceDiagram
participant Client as "Client"
participant Viva as "Viva Endpoint<br/>api/viva.py"
participant AIService as "AI Service"
participant DB as "DB Session"
Client->>Viva : POST /viva/start {topic, difficulty}
Viva->>AIService : generate_prompts(topic, difficulty)
AIService-->>Viva : prompts[]
Viva->>DB : create_viva_session(prompts)
DB-->>Viva : SessionId
Viva-->>Client : 201 Created {session_id, prompts}
```

**Diagram sources**
- [viva.py](file://backend/api/viva.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [viva.py](file://backend/api/viva.py)
- [schemas.py](file://backend/models/schemas.py)

### Advanced Features API
- Sentiment analysis
- Weakness heatmap generation
- Code-aware viva sessions
- Delivery metrics calculation

```mermaid
classDiagram
class AdvancedController {
+analyze_sentiment(text) SentimentResult
+generate_heatmap(data) HeatmapData
+code_aware_viva(code, topic) VivaResult
+calculate_metrics(performance_data) Metrics
}
class AdvancedService {
+process_text(text) SentimentResult
+compute_heatmap(data) HeatmapData
+execute_code_analysis(code, topic) VivaResult
+aggregate_metrics(data) Metrics
}
class AdvancedSchema {
+sentiment_score float
+heatmap_points Point[]
+analysis_result map
+metrics_summary map
}
AdvancedController --> AdvancedService : "uses"
AdvancedController --> AdvancedSchema : "validates/serializes"
```

**Diagram sources**
- [advanced.py](file://backend/api/advanced.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [advanced.py](file://backend/api/advanced.py)
- [schemas.py](file://backend/models/schemas.py)

### Analytics API
- Usage analytics aggregation
- Performance metrics collection
- Dashboard data preparation

```mermaid
flowchart TD
Request["GET /analytics/dashboard"] --> Aggregate["Aggregate Metrics"]
Aggregate --> Transform["Transform for Dashboard"]
Transform --> Cache["Cache Results"]
Cache --> Return["Return 200 OK"]
```

**Diagram sources**
- [analytics.py](file://backend/api/analytics.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [analytics.py](file://backend/api/analytics.py)
- [schemas.py](file://backend/models/schemas.py)

### Presentation API
- AI-generated presentation creation
- Slide deck management
- Export functionality

```mermaid
sequenceDiagram
participant Client as "Client"
participant Presentation as "Presentation Endpoint<br/>api/presentation.py"
participant AIService as "AI Service"
participant DB as "DB Session"
Client->>Presentation : POST /presentations/create {topic, style}
Presentation->>AIService : generate_presentation(topic, style)
AIService-->>Presentation : slides[]
Presentation->>DB : save_presentation(slides)
DB-->>Presentation : PresentationId
Presentation-->>Client : 201 Created {presentation_id, slides}
```

**Diagram sources**
- [presentation.py](file://backend/api/presentation.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [presentation.py](file://backend/api/presentation.py)
- [schemas.py](file://backend/models/schemas.py)

### Project-Team Linking API
- Bidirectional relationships between projects and teams
- Permission inheritance
- Bulk operations for team assignments

```mermaid
classDiagram
class ProjectTeamController {
+link_project_team(project_id, team_id) bool
+unlink_project_team(project_id, team_id) bool
+get_linked_teams(project_id) Team[]
+get_linked_projects(team_id) Project[]
}
class ProjectTeamService {
+validate_relationship(project_id, team_id) bool
+sync_permissions(project_id, team_id) bool
}
class ProjectTeamSchema {
+project_id uuid
+team_id uuid
+permissions string[]
+linked_at datetime
}
ProjectTeamController --> ProjectTeamService : "uses"
ProjectTeamController --> ProjectTeamSchema : "validates/serializes"
```

**Diagram sources**
- [project_team.py](file://backend/api/project_team.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [project_team.py](file://backend/api/project_team.py)
- [schemas.py](file://backend/models/schemas.py)

### Readiness API
- Readiness assessment calculations
- Progress tracking
- Recommendation engine

```mermaid
flowchart TD
Input["Assessment Input"] --> Calculate["Calculate Readiness Score"]
Calculate --> Analyze["Analyze Weak Areas"]
Analyze --> Recommend["Generate Recommendations"]
Recommend --> Store["Store Assessment"]
Store --> Output["Return Readiness Report"]
```

**Diagram sources**
- [readiness.py](file://backend/api/readiness.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [readiness.py](file://backend/api/readiness.py)
- [schemas.py](file://backend/models/schemas.py)

### Gamification API
- Achievement tracking
- Points and badges management
- Leaderboard calculations

```mermaid
classDiagram
class GamificationController {
+award_points(user_id, points, reason) bool
+grant_badge(user_id, badge_id) bool
+get_leaderboard(limit) LeaderboardEntry[]
+get_user_achievements(user_id) Achievement[]
}
class GamificationService {
+calculate_points(activity) int
+check_milestones(user_id) Badge[]
+update_leaderboard() void
}
class GamificationSchema {
+user_id uuid
+points int
+badges Badge[]
+achievements Achievement[]
+rank int
}
GamificationController --> GamificationService : "uses"
GamificationController --> GamificationSchema : "validates/serializes"
```

**Diagram sources**
- [gamification.py](file://backend/api/gamification.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [gamification.py](file://backend/api/gamification.py)
- [schemas.py](file://backend/models/schemas.py)

## Dependency Analysis
The dependency graph shows clear separation of concerns:
- Routers depend on services for business logic
- Services depend on data access layer for persistence
- All components use shared schemas for validation
- Authentication and authorization are cross-cutting concerns

```mermaid
graph TB
Routers["API Routers<br/>api/*"] --> Services["Services<br/>services/*"]
Services --> DataAccess["Data Access<br/>SQLAlchemy"]
DataAccess --> Database["Database<br/>Supabase PostgreSQL"]
Routers --> Schemas["Schemas<br/>models/schemas.py"]
Routers --> Auth["Authentication<br/>JWT + RBAC"]
Services --> Utils["Utilities<br/>core/*"]
```

**Diagram sources**
- [deps.py](file://backend/core/deps.py)
- [database.py](file://backend/core/database.py)
- [schemas.py](file://backend/models/schemas.py)

**Section sources**
- [deps.py](file://backend/core/deps.py)
- [database.py](file://backend/core/database.py)
- [schemas.py](file://backend/models/schemas.py)

## Performance Considerations
- Connection pooling optimization for database queries
- Query optimization with proper indexing strategies
- Caching strategies for frequently accessed data
- Rate limiting implementation for API protection
- Asynchronous processing for long-running operations
- Memory management for large file uploads
- Response compression for bandwidth optimization

## Troubleshooting Guide
Common issues and solutions:
- Database connection failures: Check connection strings and network connectivity
- Authentication errors: Verify JWT tokens and expiration times
- Validation errors: Review request payload against schema definitions
- Permission denied: Check user roles and resource ownership
- Rate limiting: Monitor request frequency and adjust limits
- Performance bottlenecks: Profile slow endpoints and optimize queries

**Section sources**
- [errors.py](file://backend/core/errors.py)
- [database.py](file://backend/core/database.py)
- [auth.py](file://backend/api/auth.py)

## Conclusion
The Horux backend provides a robust, scalable API architecture built with FastAPI. The modular design separates concerns effectively, enabling maintainable code and easy testing. Comprehensive security measures protect user data while providing flexible access controls. The database layer leverages SQLAlchemy with Supabase PostgreSQL for reliable data persistence. Future enhancements should focus on performance optimization, monitoring, and additional API features.

## Appendices

### API Versioning Strategy
- URL-based versioning: `/api/v1/...`
- Header-based versioning: `X-API-Version: 1`
- Deprecation policy with sunset headers
- Backward compatibility maintenance

### Rate Limiting Configuration
- Per-user rate limits based on subscription tier
- Global rate limits for API protection
- Sliding window algorithm implementation
- Customizable limits per endpoint

### Monitoring and Observability
- Structured logging with correlation IDs
- Health check endpoints
- Metrics collection for key KPIs
- Error tracking and alerting
- Performance profiling tools

### Security Implementation Details
- JWT token structure and claims
- Password hashing with bcrypt
- Input validation with Pydantic
- CORS configuration for cross-origin requests
- CSRF protection for state-changing operations
- SQL injection prevention with parameterized queries

**Section sources**
- [config.py](file://backend/core/config.py)
- [errors.py](file://backend/core/errors.py)
- [auth.py](file://backend/api/auth.py)
- [database.py](file://backend/core/database.py)