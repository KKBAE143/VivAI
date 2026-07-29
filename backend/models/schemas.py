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


class RefreshRequest(BaseModel):
    refresh_token: str


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
    # Role-aware onboarding. All optional so the existing student flow keeps
    # posting the same payload it posts today.
    role: str | None = None
    institution_code: str | None = None
    # Faculty-only: what they teach.
    department: str | None = None
    subjects: list[str] = []


class InstitutionCreate(BaseModel):
    name: str
    tier: str = "lite"


class FacultyApproval(BaseModel):
    member_id: str
    approve: bool


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


# ---------- Project <-> Team linking ----------
class LinkTeamRequest(BaseModel):
    """Link one of the caller's own teams to a project. Instant — the caller
    must already be a member of team_id (validated server-side)."""
    team_id: str


class RequestTeamLinkRequest(BaseModel):
    """Propose linking a team the caller is NOT a member of, identified by its
    invite code (the same discovery mechanism team joining already uses).
    Creates a pending request the team's Lead must accept or decline."""
    invite_code: str


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
    status: str  # To Do | In Progress | Review | Done


class TaskMove(BaseModel):
    id: str
    status: str
    sort_order: int = Field(ge=0)


class TaskReorder(BaseModel):
    moves: list[TaskMove] = Field(min_length=1, max_length=200)


# ---------- Viva ----------
class VivaSessionCreate(BaseModel):
    session_type: str = "Subject"
    subject: str | None = None
    project_id: str | None = None
    duration_minutes: int = 15
    difficulty: str = "Medium"
    language: str = "English"
    persona: str = "balanced"  # friendly | balanced | strict | hostile


class AnswerSubmit(BaseModel):
    answer: str
    time_taken_seconds: int | None = None


# ---------- Presentation ----------
class PresentationSessionCreate(BaseModel):
    project_id: str | None = None
    duration_minutes: int = 10
    session_type: str = "Project"
    subject: str | None = None  # free-text topic / focus for the presentation
    scenario_id: str | None = None


class AskRequest(BaseModel):
    question: str


class PresentationAnswer(BaseModel):
    answer: str
    time_taken_seconds: int | None = None


# ---------- Advanced ----------
class CodeAwareSessionCreate(BaseModel):
    snapshot_id: str
    project_id: str | None = None
    duration_minutes: int = Field(default=10, ge=5, le=20)
    language: str = "English"
    persona: str = "balanced"


class GithubLinkRequest(BaseModel):
    project_id: str | None = None
    github_url: str
    name: str | None = None


class TeamVivaCreate(BaseModel):
    team_id: str
    project_id: str | None = None
    subject: str | None = None


class AssessedVivaCreate(BaseModel):
    """A faculty member scheduling a graded team viva."""

    team_id: str
    project_id: str | None = None
    subject: str | None = None
    # Bounded: a viva is an oral exam, not an all-day event, and an unbounded
    # value would let one session hold a Gemini connection indefinitely.
    duration_minutes: int = Field(default=20, ge=5, le=120)


class SessionReview(BaseModel):
    """Faculty sign-off, optionally overriding the AI's overall score."""

    score_override: int | None = Field(default=None, ge=0, le=100)
    note: str | None = Field(default=None, max_length=2000)


class SentimentSessionCreate(BaseModel):
    project_id: str | None = None
    duration_minutes: int = 10


# ---------- Privacy / DPDP Compliance ----------
class ConsentSubmit(BaseModel):
    consent_type: str = "tos"  # tos | privacy | parental
    is_minor: bool = False


class DeletionStatusResponse(BaseModel):
    status: str  # none | pending | processing | completed
    requested_at: str | None = None
    completed_at: str | None = None


# ---------- Readiness: pitch drill ----------
class PitchDrillSubmit(BaseModel):
    project_id: str | None = None
    target_seconds: int = Field(default=90, ge=30, le=180)
    transcript: str
    actual_seconds: int = Field(ge=1)
