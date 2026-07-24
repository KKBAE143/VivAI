# Features & Modules

<cite>
**Referenced Files in This Document**
- [backend/ai/viva_core.py](file://backend/ai/viva_core.py)
- [backend/api/viva.py](file://backend/api/viva.py)
- [backend/api/projects.py](file://backend/api/projects.py)
- [backend/api/tasks.py](file://backend/api/tasks.py)
- [backend/api/teams.py](file://backend/api/teams.py)
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/api/templates.py](file://backend/api/templates.py)
- [backend/api/files.py](file://backend/api/files.py)
- [src/routes/ai-viva/index.tsx](file://src/routes/ai-viva/index.tsx)
- [src/routes/projects/index.tsx](file://src/routes/projects/index.tsx)
- [src/routes/teams/index.tsx](file://src/routes/teams/index.tsx)
- [src/components/live/team-viva-room.tsx](file://src/components/live/team-viva-room.tsx)
- [src/components/tasks/kanban-board.tsx](file://src/components/tasks/kanban-board.tsx)
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
Horux is an AI-powered learning and assessment platform designed to enhance student readiness through intelligent viva examinations, collaborative project management, real-time team communication, and advanced analytics. The platform integrates multiple modules to provide a comprehensive educational experience that combines AI-driven assessments with traditional project management and collaboration tools.

The core features include:
- AI-powered viva examination system with adaptive questioning
- Project management with task tracking and team assignment
- Real-time collaboration workspace with shared resources
- Advanced analytics dashboard with performance metrics and gamification
- Template system for customizable learning experiences
- File management capabilities for resource sharing

## Project Structure
The Horux platform follows a modern full-stack architecture with clear separation between frontend and backend components:

```mermaid
graph TB
subgraph "Frontend (React)"
A[Routes] --> B[Components]
B --> C[Hooks]
B --> D[UI Library]
end
subgraph "Backend (FastAPI)"
E[API Layer] --> F[Services]
F --> G[AI Engine]
F --> H[Database]
end
subgraph "AI Services"
I[Viva Core]
J[Live Session Manager]
K[Analytics Engine]
end
A --> E
B --> C
E --> F
F --> I
F --> J
F --> K
```

**Diagram sources**
- [src/router.tsx](file://src/router.tsx)
- [backend/main.py](file://backend/main.py)
- [backend/ai/viva_core.py](file://backend/ai/viva_core.py)

**Section sources**
- [src/router.tsx](file://src/router.tsx)
- [backend/main.py](file://backend/main.py)

## Core Components

### AI-Powered Viva Examination System
The viva examination system represents the flagship feature of Horux, providing intelligent, adaptive questioning capabilities powered by AI models.

#### Key Features:
- **Session Management**: Creation, configuration, and lifecycle management of viva sessions
- **Adaptive Questioning**: AI-generated questions based on user responses and knowledge gaps
- **Real-time Evaluation**: Instant feedback and performance scoring during live sessions
- **Multi-modal Support**: Text, audio, and code-aware questioning capabilities

#### Technical Architecture:
```mermaid
classDiagram
class VivaSession {
+string sessionId
+string title
+string[] topics
+VivaConfig config
+User participant
+Status status
+createSession()
+startSession()
+evaluateResponse(response) Score
+generateNextQuestion() Question
+endSession() Report
}
class VivaConfig {
+DifficultyLevel difficulty
+QuestionType questionType
+TimeLimit timeLimit
+Topic[] topics
+Language language
}
class AIEngine {
+generateQuestions(topics) Question[]
+evaluateAnswer(answer, expected) Score
+adaptDifficulty(currentScore) DifficultyLevel
+analyzeSentiment(text) Sentiment
}
class PerformanceEvaluator {
+calculateAccuracy(responses) float
+measureResponseTime(responses) TimeMetrics
+assessKnowledgeGaps(responses) KnowledgeMap
+generateReport(session) Report
}
VivaSession --> VivaConfig : uses
VivaSession --> AIEngine : calls
VivaSession --> PerformanceEvaluator : generates
```

**Diagram sources**
- [backend/ai/viva_core.py](file://backend/ai/viva_core.py)
- [backend/api/viva.py](file://backend/api/viva.py)

**Section sources**
- [backend/ai/viva_core.py](file://backend/ai/viva_core.py)
- [backend/api/viva.py](file://backend/api/viva.py)
- [src/routes/ai-viva/index.tsx](file://src/routes/ai-viva/index.tsx)

### Project Management Module
The project management system provides comprehensive tools for organizing, tracking, and managing academic projects with team collaboration capabilities.

#### Core Functionality:
- **Project Lifecycle Management**: Creation, planning, execution, and completion tracking
- **Task Management**: Kanban-style boards with drag-and-drop functionality
- **Team Assignment**: Role-based access control and responsibility assignment
- **Progress Monitoring**: Real-time progress tracking and milestone achievement

#### Data Flow Architecture:
```mermaid
sequenceDiagram
participant User as Team Member
participant UI as Project UI
participant API as Project API
participant Service as Project Service
participant DB as Database
User->>UI : Create New Project
UI->>API : POST /api/projects
API->>Service : createProject(data)
Service->>DB : INSERT project
DB-->>Service : projectId
Service-->>API : Project object
API-->>UI : Success response
UI->>User : Project created successfully
User->>UI : Add Task to Board
UI->>API : POST /api/tasks
API->>Service : createTask(projectId, taskData)
Service->>DB : INSERT task
DB-->>Service : taskId
Service-->>API : Task object
API-->>UI : Task added
UI->>User : Task visible on board
```

**Diagram sources**
- [backend/api/projects.py](file://backend/api/projects.py)
- [backend/api/tasks.py](file://backend/api/tasks.py)
- [src/components/tasks/kanban-board.tsx](file://src/components/tasks/kanban-board.tsx)

**Section sources**
- [backend/api/projects.py](file://backend/api/projects.py)
- [backend/api/tasks.py](file://backend/api/tasks.py)
- [src/routes/projects/index.tsx](file://src/routes/projects/index.tsx)
- [src/components/tasks/kanban-board.tsx](file://src/components/tasks/kanban-board.tsx)

### Team Collaboration Workspace
The collaboration workspace enables real-time communication and resource sharing among team members working on projects or viva preparation.

#### Key Features:
- **Real-time Communication**: Live chat and messaging within teams
- **Shared Resources**: Document sharing and collaborative editing
- **Live Sessions**: Integrated viva practice sessions with multiple participants
- **Resource Management**: Centralized file storage and organization

#### Real-time Architecture:
```mermaid
flowchart TD
A[Team Member] --> B[WebSocket Client]
B --> C[Live Session Manager]
C --> D[Message Router]
D --> E[Other Team Members]
F[File Upload] --> G[File Service]
G --> H[Storage Backend]
H --> I[Share Link Generation]
I --> J[Team Access Control]
K[Collaborative Editing] --> L[Document Sync Engine]
L --> M[Conflict Resolution]
M --> N[Version History]
```

**Diagram sources**
- [backend/api/teams.py](file://backend/api/teams.py)
- [backend/api/live.py](file://backend/api/live.py)
- [src/components/live/team-viva-room.tsx](file://src/components/live/team-viva-room.tsx)

**Section sources**
- [backend/api/teams.py](file://backend/api/teams.py)
- [backend/api/live.py](file://backend/api/live.py)
- [src/routes/teams/index.tsx](file://src/routes/teams/index.tsx)
- [src/components/live/team-viva-room.tsx](file://src/components/live/team-viva-room.tsx)

### Advanced Analytics Dashboard
The analytics dashboard provides comprehensive insights into user performance, readiness assessment, and gamification elements to motivate learning.

#### Analytics Components:
- **Performance Metrics**: Detailed analysis of viva performance across different domains
- **Readiness Assessment**: AI-powered evaluation of exam readiness and improvement areas
- **Gamification Elements**: Achievement systems, leaderboards, and progress badges
- **Trend Analysis**: Historical performance tracking and prediction algorithms

#### Analytics Processing Pipeline:
```mermaid
graph LR
A[Raw Performance Data] --> B[Data Aggregation]
B --> C[Statistical Analysis]
C --> D[Pattern Recognition]
D --> E[Insight Generation]
E --> F[Visualization Engine]
F --> G[Dashboard Display]
H[Gamification Events] --> I[Achievement Calculation]
I --> J[Leaderboard Updates]
J --> K[User Notifications]
L[Readiness Algorithms] --> M[Confidence Scoring]
M --> N[Recommendation Engine]
N --> O[Personalized Study Plans]
```

**Diagram sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/services/gamification_service.py](file://backend/services/gamification_service.py)
- [backend/services/readiness_service.py](file://backend/services/readiness_service.py)

**Section sources**
- [backend/api/analytics.py](file://backend/api/analytics.py)
- [backend/services/gamification_service.py](file://backend/services/gamification_service.py)
- [backend/services/readiness_service.py](file://backend/services/readiness_service.py)

### Template System
The template system enables creation and management of customizable learning experiences and assessment configurations.

#### Template Features:
- **Template Creation**: Visual template builder for different assessment types
- **Customization Options**: Configurable parameters for difficulty, topics, and formats
- **Sharing and Distribution**: Template marketplace and team sharing capabilities
- **Version Control**: Template versioning and rollback capabilities

#### Template Architecture:
```mermaid
classDiagram
class Template {
+string templateId
+string name
+string description
+TemplateSchema schema
+TemplateConfig config
+Category category
+Author author
+createTemplate()
+updateConfig(newConfig)
+validateSchema(data) bool
+exportTemplate() JSON
}
class TemplateSchema {
+Field[] fields
+ValidationRules rules
+DefaultValues defaults
+DynamicOptions options
}
class TemplateManager {
+createTemplate(templateData) Template
+getTemplate(templateId) Template
+searchTemplates(query) Template[]
+shareTemplate(templateId, userId) bool
+versionControl(templateId) VersionHistory
}
Template --> TemplateSchema : defines
TemplateManager --> Template : manages
```

**Diagram sources**
- [backend/api/templates.py](file://backend/api/templates.py)

**Section sources**
- [backend/api/templates.py](file://backend/api/templates.py)

### File Management Capabilities
The file management system provides secure storage, sharing, and collaborative editing capabilities for documents and resources.

#### File Management Features:
- **Secure Storage**: Encrypted file storage with access controls
- **Version Control**: Automatic versioning and change tracking
- **Collaborative Editing**: Real-time document collaboration
- **Search and Organization**: Advanced search and categorization

**Section sources**
- [backend/api/files.py](file://backend/api/files.py)

## Architecture Overview

The Horux platform follows a microservices-inspired architecture with clear separation of concerns:

```mermaid
graph TB
subgraph "Client Layer"
A[Web Application]
B[Mobile App]
C[API Clients]
end
subgraph "API Gateway"
D[Authentication]
E[Rate Limiting]
F[Request Routing]
end
subgraph "Core Services"
G[Viva Service]
H[Project Service]
I[Team Service]
J[Analytics Service]
K[Template Service]
L[File Service]
end
subgraph "AI Engine"
M[Viva AI Core]
N[Question Generator]
O[Evaluation Engine]
P[Analytics AI]
end
subgraph "Data Layer"
Q[(Primary Database)]
R[(Cache Layer)]
S[(File Storage)]
T[(Analytics Store)]
end
A --> D
B --> D
C --> D
D --> E
E --> F
F --> G
F --> H
F --> I
F --> J
F --> K
F --> L
G --> M
H --> N
I --> O
J --> P
G --> Q
H --> Q
I --> Q
J --> Q
K --> Q
L --> S
G --> R
J --> T
```

**Diagram sources**
- [backend/main.py](file://backend/main.py)
- [backend/core/config.py](file://backend/core/config.py)

## Detailed Component Analysis

### AI Viva System Deep Dive

The AI viva system represents the most complex component of the platform, integrating multiple AI services and real-time processing capabilities.

#### Session Lifecycle Management:
```mermaid
stateDiagram-v2
[*] --> Draft : Create Session
Draft --> Configured : Set Parameters
Configured --> Active : Start Session
Active --> Evaluating : Response Received
Evaluating --> Active : Next Question
Active --> Completed : End Session
Completed --> Archived : Generate Report
Archived --> [*]
Active --> Paused : Pause Request
Paused --> Active : Resume Request
```

**Diagram sources**
- [backend/ai/viva_core.py](file://backend/ai/viva_core.py)

#### Question Generation Algorithm:
```mermaid
flowchart TD
A[User Profile Analysis] --> B[Knowledge Gap Identification]
B --> C[Topic Weighting]
C --> D[Difficulty Calibration]
D --> E[Question Type Selection]
E --> F[AI Question Generation]
F --> G[Quality Validation]
G --> H{Valid Question?}
H --> |Yes| I[Return Question]
H --> |No| J[Regenerate Question]
J --> G
```

**Diagram sources**
- [backend/ai/viva_core.py](file://backend/ai/viva_core.py)

**Section sources**
- [backend/ai/viva_core.py](file://backend/ai/viva_core.py)
- [backend/api/viva.py](file://backend/api/viva.py)

### Project Management Workflow

The project management system implements a comprehensive workflow from project creation to completion:

#### Task Management Flow:
```mermaid
sequenceDiagram
participant PM as Project Manager
participant UI as Project Interface
participant API as Project API
participant TaskService as Task Service
participant Notification as Notification Service
PM->>UI : Create Project
UI->>API : POST /projects
API->>TaskService : Initialize project tasks
TaskService->>Notification : Send project created notification
Notification-->>PM : Email notification
PM->>UI : Assign Team Members
UI->>API : PUT /projects/{id}/team
API->>TaskService : Update team assignments
TaskService->>Notification : Send team updates
PM->>UI : Track Progress
UI->>API : GET /projects/{id}/progress
API->>TaskService : Calculate progress metrics
TaskService-->>UI : Progress report
UI-->>PM : Updated dashboard
```

**Diagram sources**
- [backend/api/projects.py](file://backend/api/projects.py)
- [backend/api/tasks.py](file://backend/api/tasks.py)

**Section sources**
- [backend/api/projects.py](file://backend/api/projects.py)
- [backend/api/tasks.py](file://backend/api/tasks.py)

### Real-time Collaboration Architecture

The collaboration system leverages WebSocket connections for real-time communication:

#### WebSocket Connection Flow:
```mermaid
sequenceDiagram
participant Client as Team Member Client
participant WS as WebSocket Server
participant Room as Room Manager
participant Broadcast as Message Broker
Client->>WS : Connect to room
WS->>Room : Join room session
Room->>Broadcast : Register client
Broadcast-->>Client : Welcome message
Client->>WS : Send message
WS->>Room : Route message
Room->>Broadcast : Broadcast to room
Broadcast-->>AllClients : Deliver message
Client->>WS : Disconnect
WS->>Room : Leave room
Room->>Broadcast : Remove client
```

**Diagram sources**
- [backend/api/live.py](file://backend/api/live.py)
- [backend/api/teams.py](file://backend/api/teams.py)

**Section sources**
- [backend/api/live.py](file://backend/api/live.py)
- [backend/api/teams.py](file://backend/api/teams.py)

## Dependency Analysis

The platform exhibits a well-structured dependency hierarchy with clear service boundaries:

```mermaid
graph TD
A[API Layer] --> B[Business Logic Services]
B --> C[AI Engine Services]
B --> D[Data Access Layer]
C --> E[External AI APIs]
D --> F[(Database)]
D --> G[(Cache)]
D --> H[(File Storage)]
I[Frontend Components] --> J[API Client]
J --> A
K[Analytics Engine] --> L[Data Aggregation]
L --> M[Statistical Models]
M --> N[Visualization Layer]
```

**Diagram sources**
- [backend/main.py](file://backend/main.py)
- [backend/core/config.py](file://backend/core/config.py)

**Section sources**
- [backend/main.py](file://backend/main.py)
- [backend/core/config.py](file://backend/core/config.py)

## Performance Considerations

The Horux platform incorporates several performance optimization strategies:

### Caching Strategy
- **Session State Caching**: Redis-backed caching for active viva sessions
- **Template Caching**: In-memory caching for frequently accessed templates
- **Analytics Pre-computation**: Batch processing for complex analytics queries

### Scalability Patterns
- **Horizontal Scaling**: Stateless API design enabling easy horizontal scaling
- **Load Balancing**: Distributed request handling across multiple instances
- **Connection Pooling**: Optimized database and external API connection management

### Memory Management
- **Streaming Responses**: Large file downloads and analytics reports use streaming
- **Garbage Collection Optimization**: Efficient memory usage patterns for long-running sessions
- **Resource Cleanup**: Automatic cleanup of temporary files and expired sessions

## Troubleshooting Guide

### Common Issues and Solutions

#### Viva Session Problems
- **Session Timeout**: Implement automatic session recovery and state persistence
- **AI Service Unavailability**: Configure fallback mechanisms and graceful degradation
- **Real-time Connection Drops**: Implement reconnection logic and message queuing

#### Performance Bottlenecks
- **Slow Question Generation**: Cache common question patterns and optimize AI prompts
- **Database Query Performance**: Implement query optimization and indexing strategies
- **Memory Leaks**: Monitor long-running processes and implement proper resource cleanup

#### Integration Issues
- **External API Failures**: Implement circuit breaker patterns and retry logic
- **WebSocket Connection Issues**: Configure proper heartbeat mechanisms and error handling
- **File Upload Failures**: Implement chunked uploads and resume capabilities

**Section sources**
- [backend/core/errors.py](file://backend/core/errors.py)
- [backend/core/logging.py](file://backend/core/logging.py)

## Conclusion

The Horux platform represents a comprehensive educational technology solution that successfully integrates AI-powered assessment capabilities with traditional project management and collaboration tools. The modular architecture ensures scalability and maintainability while providing rich functionality for both individual learners and team-based educational environments.

Key strengths of the platform include:
- Sophisticated AI integration for adaptive learning experiences
- Robust real-time collaboration capabilities
- Comprehensive analytics and reporting features
- Flexible template system for customization
- Strong foundation for future feature expansion

The platform's design principles emphasize user experience, performance, and extensibility, making it suitable for various educational contexts from individual study to institutional deployment.