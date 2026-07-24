# Database Schema & Models

<cite>
**Referenced Files in This Document**
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [001_platform_enhancement.sql](file://backend/migrations/001_platform_enhancement.sql)
- [002_quality_upgrade.sql](file://backend/migrations/002_quality_upgrade.sql)
- [003_team_project_linking.sql](file://backend/migrations/003_team_project_linking.sql)
- [004_team_viva_voice.sql](file://backend/migrations/004_team_viva_voice.sql)
- [database.py](file://backend/core/database.py)
- [schemas.py](file://backend/models/schemas.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [project_team.py](file://backend/api/project_team.py)
- [analytics.py](file://backend/api/analytics.py)
- [auth.py](file://backend/api/auth.py)
- [main.py](file://backend/main.py)
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
This document provides comprehensive data model documentation for the Horux platform database schema. It covers entity relationships, field definitions, data types, constraints, primary and foreign key relationships, indexes, triggers, migration strategy, version control practices, rollback procedures, validation rules, business logic constraints, referential integrity policies, query patterns, common joins, performance considerations for large datasets, sample queries, data access patterns, and ORM usage examples with SQLAlchemy models.

The schema is defined using SQL files under the backend directory and consumed by the FastAPI application via a database configuration module. The migrations are organized as numbered SQL scripts to evolve the schema over time.

## Project Structure
The database-related artifacts relevant to this documentation are located under the backend directory:
- Schema definition: supabase_schema.sql
- Migrations: 001_platform_enhancement.sql, 002_quality_upgrade.sql, 003_team_project_linking.sql, 004_team_viva_voice.sql
- Database configuration: core/database.py
- Pydantic schemas (models): models/schemas.py
- API endpoints that interact with the schema: api/projects.py, api/teams.py, api/project_team.py, api/analytics.py, api/auth.py
- Application entry point: main.py

```mermaid
graph TB
A["Application Entry<br/>main.py"] --> B["Database Config<br/>core/database.py"]
A --> C["API Endpoints<br/>api/*.py"]
C --> D["Pydantic Schemas<br/>models/schemas.py"]
B --> E["SQL Schema<br/>backend/supabase_schema.sql"]
B --> F["Migrations<br/>backend/migrations/*.sql"]
```

**Diagram sources**
- [main.py](file://backend/main.py)
- [database.py](file://backend/core/database.py)
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [001_platform_enhancement.sql](file://backend/migrations/001_platform_enhancement.sql)
- [002_quality_upgrade.sql](file://backend/migrations/002_quality_upgrade.sql)
- [003_team_project_linking.sql](file://backend/migrations/003_team_project_linking.sql)
- [004_team_viva_voice.sql](file://backend/migrations/004_team_viva_voice.sql)
- [schemas.py](file://backend/models/schemas.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [project_team.py](file://backend/api/project_team.py)
- [analytics.py](file://backend/api/analytics.py)
- [auth.py](file://backend/api/auth.py)

**Section sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [001_platform_enhancement.sql](file://backend/migrations/001_platform_enhancement.sql)
- [002_quality_upgrade.sql](file://backend/migrations/002_quality_upgrade.sql)
- [003_team_project_linking.sql](file://backend/migrations/003_team_project_linking.sql)
- [004_team_viva_voice.sql](file://backend/migrations/004_team_viva_voice.sql)
- [database.py](file://backend/core/database.py)
- [schemas.py](file://backend/models/schemas.py)
- [projects.py](file://backend/api/projects.py)
- [teams.py](file://backend/api/teams.py)
- [project_team.py](file://backend/api/project_team.py)
- [analytics.py](file://backend/api/analytics.py)
- [auth.py](file://backend/api/auth.py)
- [main.py](file://backend/main.py)

## Core Components
The core data model components include:
- Users: identity and authentication information
- Projects: project entities and metadata
- Teams: team entities and membership
- Sessions: live or recorded sessions associated with projects and users
- Analytics: metrics and analytics data tied to sessions, projects, and teams

These components are modeled through SQL tables and enforced via constraints, indexes, and triggers. Pydantic schemas provide request/response validation at the API layer.

Key responsibilities:
- Users: manage user accounts and roles
- Projects: encapsulate project lifecycle and ownership
- Teams: group users and link to projects
- Sessions: capture session events and outcomes
- Analytics: aggregate metrics for reporting and insights

**Section sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [schemas.py](file://backend/models/schemas.py)

## Architecture Overview
The database architecture follows a relational model with clear separation between core entities and their relationships. Indexes optimize read-heavy operations such as listing projects per team or querying analytics by date ranges. Triggers enforce data integrity and maintain derived fields where necessary.

```mermaid
erDiagram
USERS {
uuid id PK
text email UK
text password_hash
text full_name
timestamp created_at
timestamp updated_at
}
PROJECTS {
uuid id PK
uuid owner_id FK
text title
text description
timestamp created_at
timestamp updated_at
}
TEAMS {
uuid id PK
uuid owner_id FK
text name
timestamp created_at
timestamp updated_at
}
TEAM_MEMBERS {
uuid team_id FK
uuid user_id FK
enum role
}
PROJECT_TEAMS {
uuid project_id FK
uuid team_id FK
}
SESSIONS {
uuid id PK
uuid project_id FK
uuid user_id FK
text type
jsonb metadata
timestamp started_at
timestamp ended_at
}
ANALYTICS {
uuid id PK
uuid session_id FK
uuid project_id FK
text metric_key
numeric value
timestamp recorded_at
}
USERS ||--o{ PROJECTS : "owns"
USERS ||--o{ TEAMS : "owns"
TEAMS ||--o{ TEAM_MEMBERS : "has_members"
USERS ||--o{ TEAM_MEMBERS : "member_of"
PROJECTS ||--o{ PROJECT_TEAMS : "linked_to_teams"
TEAMS ||--o{ PROJECT_TEAMS : "linked_to_projects"
PROJECTS ||--o{ SESSIONS : "has_sessions"
USERS ||--o{ SESSIONS : "created_by"
SESSIONS ||--o{ ANALYTICS : "produces_metrics"
PROJECTS ||--o{ ANALYTICS : "aggregated_by_project"
```

**Diagram sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)

## Detailed Component Analysis

### Users
- Purpose: Represents authenticated users with profile attributes.
- Key fields:
  - id: Primary key, unique identifier
  - email: Unique email address
  - password_hash: Secure hash for authentication
  - full_name: Display name
  - created_at, updated_at: Timestamps
- Constraints:
  - Primary key on id
  - Unique constraint on email
- Indexes:
  - Email index for fast lookups during authentication
- Relationships:
  - One-to-many with Projects (owner)
  - One-to-many with Teams (owner)
  - Many-to-many with Teams via Team Members
  - One-to-many with Sessions (creator)

Validation rules:
- Email must be valid format
- Password hash must not be empty
- Full name optional but validated if present

Business logic constraints:
- User deletion cascades to dependent records based on referential integrity policy

Sample query patterns:
- Find user by email
- List all projects owned by a user

ORM usage example (SQLAlchemy model outline):
- Define a User model with mapped columns corresponding to table fields
- Use relationship attributes for Projects, Teams, Sessions

**Section sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [auth.py](file://backend/api/auth.py)

### Projects
- Purpose: Encapsulates project entities with ownership and metadata.
- Key fields:
  - id: Primary key
  - owner_id: Foreign key to Users
  - title, description: Textual metadata
  - created_at, updated_at: Timestamps
- Constraints:
  - Primary key on id
  - Foreign key to Users(owner_id)
- Indexes:
  - Owner_id index for efficient filtering by owner
- Relationships:
  - Many-to-one with Users (owner)
  - Many-to-many with Teams via Project Teams
  - One-to-many with Sessions
  - One-to-many with Analytics (aggregation)

Validation rules:
- Title required and non-empty
- Description optional but validated if provided

Business logic constraints:
- Project cannot be deleted if it has active sessions unless cascade policy allows

Sample query patterns:
- List projects by owner
- Join with teams to find linked teams

ORM usage example (SQLAlchemy model outline):
- Define a Project model with mapped columns
- Use relationship attributes for Owner, Teams, Sessions, Analytics

**Section sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [projects.py](file://backend/api/projects.py)

### Teams
- Purpose: Groups users and links to projects.
- Key fields:
  - id: Primary key
  - owner_id: Foreign key to Users
  - name: Team name
  - created_at, updated_at: Timestamps
- Constraints:
  - Primary key on id
  - Foreign key to Users(owner_id)
- Indexes:
  - Owner_id index for filtering by owner
- Relationships:
  - Many-to-one with Users (owner)
  - Many-to-many with Projects via Project Teams
  - Many-to-many with Users via Team Members

Validation rules:
- Name required and non-empty

Business logic constraints:
- Team deletion cascades to members and project links based on policy

Sample query patterns:
- List teams by owner
- Find projects linked to a team

ORM usage example (SQLAlchemy model outline):
- Define a Team model with mapped columns
- Use relationship attributes for Owner, Projects, Members

**Section sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [teams.py](file://backend/api/teams.py)

### Sessions
- Purpose: Captures session events and outcomes for projects and users.
- Key fields:
  - id: Primary key
  - project_id: Foreign key to Projects
  - user_id: Foreign key to Users
  - type: Session type discriminator
  - metadata: JSONB for flexible session data
  - started_at, ended_at: Timestamps
- Constraints:
  - Primary key on id
  - Foreign keys to Projects(project_id), Users(user_id)
- Indexes:
  - project_id and user_id indexes for filtering
  - started_at index for time-range queries
- Relationships:
  - Many-to-one with Projects
  - Many-to-one with Users
  - One-to-many with Analytics

Validation rules:
- Type must be a valid enum value
- Metadata must conform to expected schema

Business logic constraints:
- Session end time must be after start time

Sample query patterns:
- List sessions by project and date range
- Aggregate metrics by session

ORM usage example (SQLAlchemy model outline):
- Define a Session model with mapped columns
- Use relationship attributes for Project, User, Analytics

**Section sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [analytics.py](file://backend/api/analytics.py)

### Analytics
- Purpose: Stores metrics and analytics data aggregated from sessions and projects.
- Key fields:
  - id: Primary key
  - session_id: Foreign key to Sessions
  - project_id: Foreign key to Projects
  - metric_key: Identifier for the metric
  - value: Numeric value
  - recorded_at: Timestamp
- Constraints:
  - Primary key on id
  - Foreign keys to Sessions(session_id), Projects(project_id)
- Indexes:
  - session_id and project_id indexes for aggregation queries
  - recorded_at index for time-series analysis
- Relationships:
  - Many-to-one with Sessions
  - Many-to-one with Projects

Validation rules:
- Metric key must be valid and recognized
- Value must be numeric and within acceptable range

Business logic constraints:
- Duplicate metric entries may be prevented via unique constraints or upsert logic

Sample query patterns:
- Aggregate metrics by project over time
- Retrieve session-specific metrics

ORM usage example (SQLAlchemy model outline):
- Define an Analytics model with mapped columns
- Use relationship attributes for Session, Project

**Section sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [analytics.py](file://backend/api/analytics.py)

### Team Members and Project Teams (Linking Tables)
- Purpose: Implement many-to-many relationships between Teams and Users, and between Projects and Teams.
- Key fields:
  - Team Members: team_id, user_id, role
  - Project Teams: project_id, team_id
- Constraints:
  - Composite primary keys or unique constraints on pairs
  - Foreign keys to ensure referential integrity
- Indexes:
  - team_id and user_id indexes for membership queries
  - project_id and team_id indexes for linking queries

Validation rules:
- Role must be a valid enum value
- Links must reference existing entities

Business logic constraints:
- Prevent duplicate memberships or links

Sample query patterns:
- List members of a team
- Find teams linked to a project

ORM usage example (SQLAlchemy model outline):
- Define association models for TeamMembers and ProjectTeams
- Use relationship attributes to navigate associations

**Section sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)
- [project_team.py](file://backend/api/project_team.py)

## Dependency Analysis
The database schema exhibits clear dependency chains:
- Users are referenced by Projects, Teams, Sessions, and Team Members
- Projects are referenced by Sessions, Analytics, and Project Teams
- Teams are referenced by Team Members and Project Teams
- Sessions are referenced by Analytics

```mermaid
graph TB
U["Users"] --> P["Projects"]
U --> T["Teams"]
U --> S["Sessions"]
U --> TM["Team Members"]
P --> S
P --> A["Analytics"]
P --> PT["Project Teams"]
T --> TM
T --> PT
S --> A
```

**Diagram sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)

**Section sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)

## Performance Considerations
- Indexing strategy:
  - Create indexes on frequently filtered columns (email, owner_id, project_id, user_id, started_at, recorded_at)
  - Composite indexes for common join patterns (e.g., project_id + started_at for session queries)
- Query optimization:
  - Use selective WHERE clauses to reduce result sets
  - Avoid SELECT *; specify only needed columns
  - Leverage pagination for large result sets
- Data volume management:
  - Partition large tables by time (e.g., Analytics by month)
  - Archive old sessions and analytics data
- Concurrency:
  - Use transactions for multi-step writes to maintain consistency
  - Avoid long-running transactions that lock resources

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Constraint violations:
  - Check foreign key references before inserts/updates
  - Validate input data against Pydantic schemas
- Performance bottlenecks:
  - Analyze slow queries with EXPLAIN plans
  - Add missing indexes or refine existing ones
- Migration failures:
  - Review migration scripts for syntax errors
  - Ensure dependencies are applied in correct order

**Section sources**
- [database.py](file://backend/core/database.py)
- [schemas.py](file://backend/models/schemas.py)

## Conclusion
The Horux platform database schema is designed with clear entity relationships, robust constraints, and performance-oriented indexing. Migrations provide a structured approach to evolving the schema, while Pydantic schemas ensure data validation at the API boundary. Following the recommended query patterns and performance guidelines will help maintain scalability and reliability as the dataset grows.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Migration Strategy
- Version control:
  - Each migration is a numbered SQL file to ensure ordered execution
  - Maintain a migration history log to track changes
- Rollback procedures:
  - Prepare reverse migration scripts for each forward migration
  - Test rollbacks in staging environments before production deployment
- Execution:
  - Apply migrations in sequence using a migration runner
  - Verify schema state after each migration

**Section sources**
- [001_platform_enhancement.sql](file://backend/migrations/001_platform_enhancement.sql)
- [002_quality_upgrade.sql](file://backend/migrations/002_quality_upgrade.sql)
- [003_team_project_linking.sql](file://backend/migrations/003_team_project_linking.sql)
- [004_team_viva_voice.sql](file://backend/migrations/004_team_viva_voice.sql)

### Sample Queries
- Find user by email:
  - SELECT * FROM users WHERE email = 'user@example.com'
- List projects by owner:
  - SELECT * FROM projects WHERE owner_id = 'uuid'
- Get sessions for a project in a date range:
  - SELECT * FROM sessions WHERE project_id = 'uuid' AND started_at BETWEEN 'start' AND 'end'
- Aggregate analytics by project:
  - SELECT project_id, SUM(value) FROM analytics GROUP BY project_id

**Section sources**
- [supabase_schema.sql](file://backend/supabase_schema.sql)

### ORM Usage Examples (SQLAlchemy)
- Define models mapping to tables
- Use relationship attributes to navigate associations
- Perform CRUD operations with session management
- Execute complex queries with joins and filters

**Section sources**
- [schemas.py](file://backend/models/schemas.py)