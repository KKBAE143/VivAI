# API Architecture & Design

<cite>
**Referenced Files in This Document**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)
- [errors.py](file://backend/core/errors.py)
- [logging.py](file://backend/core/logging.py)
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)
- [conftest.py](file://backend/tests/conftest.py)
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

## Introduction
This document describes the architecture and design of the Horux FastAPI backend API. It covers high-level API design patterns, endpoint organization, request/response flow, dependency injection using FastAPI’s DI container, middleware stack configuration, error handling strategies, logging infrastructure, application startup sequence, configuration management, environment-specific settings, database connection pooling, SQLAlchemy session management, transaction handling patterns, and standardized response and error code conventions. The goal is to provide a comprehensive reference for both new contributors and experienced developers working on the backend.

## Project Structure
The backend follows a layered structure:
- Entry point and application factory
- Core subsystems (configuration, database, dependencies, errors, logging)
- API routers organized by domain
- Services layer for business logic
- Tests with fixtures and test isolation

```mermaid
graph TB
A["Application Entry<br/>main.py"] --> B["Core Config<br/>core/config.py"]
A --> C["Core Logging<br/>core/logging.py"]
A --> D["Core Database<br/>core/database.py"]
A --> E["Core Deps<br/>core/deps.py"]
A --> F["Core Errors<br/>core/errors.py"]
A --> G["API Routers<br/>api/*.py"]
G --> H["Services<br/>services/*.py"]
D --> I["Database Engine & Sessions"]
E --> J["FastAPI Dependency Injection"]
F --> K["Global Error Handlers"]
```

**Diagram sources**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [logging.py](file://backend/core/logging.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)
- [errors.py](file://backend/core/errors.py)
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)

**Section sources**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)
- [errors.py](file://backend/core/errors.py)
- [logging.py](file://backend/core/logging.py)
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)

## Core Components
- Application entrypoint and startup lifecycle
  - Creates the FastAPI app instance, registers middleware, mounts routers, configures CORS, and sets up lifespan events for initialization and shutdown.
- Configuration management
  - Centralized settings loaded from environment variables or configuration files, validated at startup, and exposed via typed accessors.
- Logging infrastructure
  - Structured logging configured early in startup; log levels and handlers are configurable per environment.
- Database subsystem
  - Connection pool setup, engine creation, base metadata, and session factories. Provides scoped sessions for requests and background tasks.
- Dependency injection
  - Reusable dependencies for DB sessions, current user context, and service instances. Ensures single-responsibility and testability.
- Error handling
  - Global exception handlers map domain exceptions to HTTP responses with consistent status codes and payloads.
- API routers
  - Domain-scoped routers (auth, projects, teams, tasks, etc.) that depend on services and shared dependencies.

**Section sources**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [logging.py](file://backend/core/logging.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)
- [errors.py](file://backend/core/errors.py)

## Architecture Overview
High-level request flow through the API:
- Client sends an HTTP request to a mounted router.
- Middleware processes headers, auth, rate limiting, and logging.
- Router resolves path parameters and query/body data.
- Endpoint function calls service methods via injected dependencies.
- Service orchestrates business logic and uses DB sessions for persistence.
- Responses are formatted consistently and returned.

```mermaid
sequenceDiagram
participant Client as "Client"
participant App as "FastAPI App"
participant MW as "Middleware Stack"
participant Router as "Domain Router"
participant EP as "Endpoint Function"
participant Svc as "Service Layer"
participant DB as "DB Session"
Client->>App : "HTTP Request"
App->>MW : "Process request"
MW-->>App : "Headers/Context ready"
App->>Router : "Route match"
Router->>EP : "Call endpoint"
EP->>Svc : "Invoke service method"
Svc->>DB : "Query/Write"
DB-->>Svc : "Result"
Svc-->>EP : "Business result"
EP-->>Client : "Standardized Response"
```

**Diagram sources**
- [main.py](file://backend/main.py)
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)

## Detailed Component Analysis

### Application Startup and Lifecycle
- Application factory creates the FastAPI app and applies global configuration.
- Lifespan events initialize resources (e.g., caches, indexes) and ensure graceful shutdown.
- Routers are mounted under versioned prefixes for API evolution.
- CORS and security policies are applied during startup.

```mermaid
flowchart TD
Start(["Startup"]) --> LoadConfig["Load configuration"]
LoadConfig --> SetupLogging["Configure logging"]
SetupLogging --> CreateApp["Create FastAPI app"]
CreateApp --> ApplyMiddleware["Apply middleware stack"]
ApplyMiddleware --> MountRouters["Mount API routers"]
MountRouters --> RegisterErrors["Register global error handlers"]
RegisterErrors --> LifespanInit["Lifespan init hooks"]
LifespanInit --> Ready(["Ready"])
```

**Diagram sources**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [logging.py](file://backend/core/logging.py)

**Section sources**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [logging.py](file://backend/core/logging.py)

### Configuration Management
- Environment-driven settings with validation and defaults.
- Separate profiles for development, staging, and production.
- Secrets and sensitive values sourced from environment variables.
- Typed configuration objects consumed by services and database layer.

**Section sources**
- [config.py](file://backend/core/config.py)

### Logging Infrastructure
- Structured logs with contextual fields (request ID, user, correlation).
- Log rotation and output destinations configurable per environment.
- Integration with FastAPI request pipeline for end-to-end tracing.

**Section sources**
- [logging.py](file://backend/core/logging.py)

### Database Connection Pooling and Session Management
- Engine created with connection pool parameters tuned for workload.
- Base metadata defined for declarative models.
- Scoped session factory ensures one session per request.
- Transaction boundaries managed at service or repository level.

```mermaid
classDiagram
class Database {
+engine
+SessionLocal()
+get_session()
+close_all()
}
class Session {
+begin()
+commit()
+rollback()
+query(model)
}
Database --> Session : "provides"
```

**Diagram sources**
- [database.py](file://backend/core/database.py)

**Section sources**
- [database.py](file://backend/core/database.py)

### Dependency Injection System
- FastAPI’s DI container provides reusable dependencies:
  - Database session provider
  - Current authenticated user context
  - Service instances
- Dependencies are declared in endpoints and services to promote loose coupling.
- Test overrides inject mock implementations for isolation.

```mermaid
classDiagram
class Deps {
+get_db_session()
+get_current_user()
+get_service_instance()
}
class AuthDeps {
+require_auth()
+resolve_user_context()
}
class ProjectsDeps {
+get_project_service()
}
Deps <.. AuthDeps : "extends"
Deps <.. ProjectsDeps : "extends"
```

**Diagram sources**
- [deps.py](file://backend/core/deps.py)
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)

**Section sources**
- [deps.py](file://backend/core/deps.py)
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)

### Middleware Stack Configuration
- Ordered middleware for cross-cutting concerns:
  - Security headers
  - CORS policy
  - Request ID propagation
  - Rate limiting (optional)
  - Access logging
- Custom middleware can be added for domain-specific needs.

```mermaid
flowchart LR
Ingress["Incoming Request"] --> Sec["Security Headers"]
Sec --> CORS["CORS Policy"]
CORS --> ReqID["Request ID Context"]
ReqID --> Rate["Rate Limiting"]
Rate --> Log["Access Logging"]
Log --> Router["Router Dispatch"]
```

**Diagram sources**
- [main.py](file://backend/main.py)

**Section sources**
- [main.py](file://backend/main.py)

### Error Handling Strategies
- Global exception handlers convert domain exceptions into standardized HTTP responses.
- Consistent payload shape includes error code, message, and optional details.
- Validation errors mapped to appropriate HTTP status codes.

```mermaid
flowchart TD
Err["Exception Raised"] --> MapErr["Map to HTTP Error"]
MapErr --> FormatResp["Format Standard Payload"]
FormatResp --> ReturnErr["Return Response"]
```

**Diagram sources**
- [errors.py](file://backend/core/errors.py)

**Section sources**
- [errors.py](file://backend/core/errors.py)

### API Endpoints Organization and Patterns
- Domain-based routers:
  - Authentication endpoints
  - Projects endpoints
  - Teams endpoints
  - Tasks endpoints
- Endpoints follow consistent patterns:
  - Input validation via Pydantic schemas
  - Dependency injection for services and DB sessions
  - Uniform response formatting
  - Clear separation of concerns between route and service layers

```mermaid
graph TB
subgraph "Auth"
A1["POST /auth/login"]
A2["POST /auth/register"]
end
subgraph "Projects"
P1["GET /projects"]
P2["POST /projects"]
P3["GET /projects/{id}"]
end
subgraph "Teams"
T1["GET /teams"]
T2["POST /teams"]
end
subgraph "Tasks"
K1["GET /tasks"]
K2["POST /tasks"]
end
```

**Diagram sources**
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)

**Section sources**
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)

### Request/Response Flow Architecture
- Endpoints receive validated input, delegate to services, and return structured responses.
- Services encapsulate business rules and coordinate multiple repositories or external calls.
- Responses include standard fields: status, data, and error information when applicable.

```mermaid
sequenceDiagram
participant Client as "Client"
participant Router as "Router"
participant EP as "Endpoint"
participant Svc as "Service"
participant DB as "DB Session"
Client->>Router : "HTTP Request"
Router->>EP : "Dispatch"
EP->>Svc : "Call service"
Svc->>DB : "Read/Write"
DB-->>Svc : "Data"
Svc-->>EP : "Result"
EP-->>Client : "Standard Response"
```

**Diagram sources**
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)
- [database.py](file://backend/core/database.py)

**Section sources**
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)
- [database.py](file://backend/core/database.py)

### Transaction Handling Patterns
- Begin transaction at service entry when multiple writes occur.
- Commit on success; rollback on failure.
- Use explicit transaction boundaries to maintain consistency across operations.

```mermaid
flowchart TD
StartTx["Begin Transaction"] --> Ops["Execute Operations"]
Ops --> Success{"All succeed?"}
Success --> |Yes| Commit["Commit"]
Success --> |No| Rollback["Rollback"]
Commit --> Done([Done])
Rollback --> Done
```

[No sources needed since this diagram shows conceptual workflow, not actual code structure]

### Test Isolation and DI Overrides
- Test fixtures override dependencies to inject in-memory databases and mocks.
- Each test runs with isolated state and deterministic behavior.
- Conftest centralizes shared fixtures and client setup.

```mermaid
classDiagram
class TestConftest {
+client_fixture()
+db_override()
+user_mock()
}
class TestClient {
+post(path, json)
+get(path)
}
TestConftest --> TestClient : "provides"
```

**Diagram sources**
- [conftest.py](file://backend/tests/conftest.py)

**Section sources**
- [conftest.py](file://backend/tests/conftest.py)

## Dependency Analysis
Component relationships and coupling:
- main.py depends on core modules for configuration, logging, database, deps, and errors.
- API routers depend on services and shared dependencies.
- Services depend on database sessions and external integrations.
- Tests depend on conftest fixtures and override dependencies.

```mermaid
graph TB
Main["main.py"] --> CoreCfg["core/config.py"]
Main --> CoreLog["core/logging.py"]
Main --> CoreDB["core/database.py"]
Main --> CoreDeps["core/deps.py"]
Main --> CoreErr["core/errors.py"]
Main --> ApiAuth["api/auth.py"]
Main --> ApiProj["api/projects.py"]
Main --> ApiTeam["api/teams.py"]
Main --> ApiTask["api/tasks.py"]
ApiProj --> CoreDB
ApiTeam --> CoreDB
ApiTask --> CoreDB
CoreDeps --> CoreDB
```

**Diagram sources**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [logging.py](file://backend/core/logging.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)
- [errors.py](file://backend/core/errors.py)
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)

**Section sources**
- [main.py](file://backend/main.py)
- [config.py](file://backend/core/config.py)
- [logging.py](file://backend/core/logging.py)
- [database.py](file://backend/core/database.py)
- [deps.py](file://backend/core/deps.py)
- [errors.py](file://backend/core/errors.py)
- [auth.py](file://backend/api/auth.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [tasks.py](file://backend/api/tasks.py)

## Performance Considerations
- Tune connection pool size based on expected concurrency and database capacity.
- Use connection pooling and reuse sessions per request to minimize overhead.
- Avoid N+1 queries by leveraging eager loading where appropriate.
- Cache frequently accessed read-only data at the service layer.
- Profile slow endpoints and add targeted indexing to database tables.
- Keep middleware minimal and efficient; avoid heavy computations in request path.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Verify configuration values and environment variables at startup.
- Inspect structured logs for request IDs and error traces.
- Check global error handlers for unexpected exceptions and ensure proper mapping to HTTP statuses.
- Validate database connectivity and pool exhaustion symptoms.
- Use test fixtures to reproduce issues deterministically.

**Section sources**
- [config.py](file://backend/core/config.py)
- [logging.py](file://backend/core/logging.py)
- [errors.py](file://backend/core/errors.py)
- [database.py](file://backend/core/database.py)
- [conftest.py](file://backend/tests/conftest.py)

## Conclusion
The Horux FastAPI backend employs a clean, layered architecture with clear separation of concerns. FastAPI’s dependency injection enables modular and testable code. Centralized configuration, logging, and error handling improve reliability and observability. Database pooling and session management support scalable data access. Following the documented patterns ensures consistent API design, robust error handling, and maintainable code.