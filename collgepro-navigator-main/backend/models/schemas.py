"""Pydantic request/response schemas for all endpoints."""
from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------
class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    college: str | None = None
    year: str | None = None
    branch: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    access_token: str
    new_password: str = Field(min_length=6)


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    college_name: str | None = None
    year: str | None = None
    branch: str | None = None
    roll_number: str | None = None
    bio: str | None = None
    avatar_url: str | None = None


class OnboardingComplete(BaseModel):
    branch: str | None = None
    year: str | None = None
    goals: list[str] = []


# ---------- Projects ----------
class ProjectCreate(BaseModel):
    title: str
    type: str  # PBL | Major | Mini
    subject: str | None = None
    tech_stack: list[str] = []
    problem_statement: str | None = None
    description: str | None = None
    deadline: str | None = None
    semester: str | None = None


class ProjectUpdate(BaseModel):
    title: str | None = None
    type: str | None = None
    subject: str | None = None
    tech_stack: list[str] | None = None
    problem_statement: str | None = None
    description: str | None = None
    status: str | None = None
    deadline: str | None = None
    semester: str | None = None


class ProgressUpdate(BaseModel):
    progress: int = Field(ge=0, le=100)


# ---------- Teams ----------
class TeamCreate(BaseModel):
    name: str
    project_id: str | None = None


class InviteRequest(BaseModel):
    email: EmailStr


class JoinRequest(BaseModel):
    code: str


class RoleUpdate(BaseModel):
    role: str  # Lead | Member


# ---------- Tasks ----------
class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    assignee_id: str | None = None
    priority: str = "med"
    due_date: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    assignee_id: str | None = None
    status: str | None = None
    priority: str | None = None
    due_date: str | None = None


class TaskStatusUpdate(BaseModel):
    status: str  # To Do | In Progress | Done


# ---------- Viva ----------
class VivaSessionCreate(BaseModel):
    session_type: str = "Subject"
    subject: str | None = None
    project_id: str | None = None
    duration_minutes: int = 15
    difficulty: str = "Medium"
    language: str = "English"


class AnswerSubmit(BaseModel):
    answer: str
    time_taken_seconds: int | None = None


# ---------- Presentation ----------
class PresentationSessionCreate(BaseModel):
    project_id: str | None = None
    duration_minutes: int = 10
    session_type: str = "Project"


class AskRequest(BaseModel):
    question: str


# ---------- Advanced ----------
class CodeAwareSessionCreate(BaseModel):
    snapshot_id: str
    project_id: str | None = None
    duration_minutes: int = 20
    language: str = "English"


class GithubLinkRequest(BaseModel):
    project_id: str | None = None
    github_url: str
    name: str | None = None


class TeamVivaCreate(BaseModel):
    team_id: str
    project_id: str | None = None
    subject: str | None = None


class FacultyProfileCreate(BaseModel):
    name: str
    college_name: str | None = None
    subjects: list[str] = []
    style_tags: list[str] = []
    known_patterns: str | None = None
    difficulty_level: str = "Medium"


class FacultySimSessionCreate(BaseModel):
    subject: str | None = None
    project_id: str | None = None
    duration_minutes: int = 15
    language: str = "English"


class FacultySimEnd(BaseModel):
    accuracy_rating: int | None = Field(default=None, ge=1, le=5)
    feedback: str | None = None


class SentimentSessionCreate(BaseModel):
    project_id: str | None = None
    duration_minutes: int = 10
