"""Pydantic schemas for project CRUD, funding, updates, permissions, and option catalogs."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field


class ProjectBase(BaseModel):
    """Shared project fields used by create, update, and read schemas."""
    title: str
    institution: str
    domain: str
    ai_type: str

    lifecycle_stage: str = "Research & ideation"
    trl_level: str = "TRL 1 - basic concept"
    trc_category: str = "Research"

    funding_amount_sgd: Decimal | None = Field(default=None, ge=0)
    funds_received: str | None = None
    funding_scope: str | None = None
    grant_year_obtained: int | None = Field(default=None, ge=1900)
    grant_start_date: date | None = None
    grant_end_date: date | None = None
    start_date: date | None = None
    end_date: datetime | None = None

    collaboration_formal_signed: str | None = None
    collaboration_formal_partner: str | None = None
    collaboration_formal_scope: str | None = None
    collaboration_informal_partner: str | None = None
    collaboration_informal_scope: str | None = None
    patent_count: int | None = Field(default=None, ge=0)
    publication: str | None = None
    possible_synergy: str | None = None
    ai_office_involvement: str | None = None

    description: str | None = None


class ProjectCreate(ProjectBase):
    """Request payload for creating a project."""
    pass

# Same fields as `ProjectBase`, but optional to support PATCH semantics.
class ProjectUpdate(ProjectBase):
    """Partial-update payload for modifying an existing project."""
    title: str | None = None
    institution: str | None = None
    domain: str | None = None
    ai_type: str | None = None


class ProjectOut(ProjectBase):
    """Full project payload returned by project endpoints."""
    id: int
    owner_id: int
    created_at: datetime
    updated_at: datetime


class ProjectPersonBrief(BaseModel):
    """Lightweight user summary for project participation lists."""
    user_id: int
    email: str
    full_name: str | None
    role: str


class ProjectListItem(BaseModel):
    """List-view projection of a project with visibility-safe fields."""
    id: int
    title: str
    people_involved: list[ProjectPersonBrief]
    can_view_details: bool

    institution: str | None = None
    domain: str | None = None
    ai_type: str | None = None
    lifecycle_stage: str | None = None
    trl_level: str | None = None
    trc_category: str | None = None
    funding_amount_sgd: Decimal | None = None
    updated_at: datetime


class ProjectUpdateCreate(BaseModel):
    """Payload for adding a project update note."""
    status: str = "Update"
    note: str


class ProjectEndRequest(BaseModel):
    """Optional note payload when marking a project as ended."""
    note: str | None = None


class ProjectFundingEventCreate(BaseModel):
    """Payload for recording additional project funding."""
    amount_sgd: Decimal = Field(gt=0)
    note: str | None = None


class ProjectUpdateOut(BaseModel):
    """Response schema for a persisted project update entry."""
    id: int
    project_id: int
    author_user_id: int
    status: str
    note: str
    created_at: datetime


class ProjectFundingEventOut(BaseModel):
    """Response schema for a persisted funding event entry."""
    id: int
    project_id: int
    author_user_id: int
    amount_sgd: Decimal
    note: str | None
    created_at: datetime


ProjectAccessLevel = Literal["principal_investigator", "team_member", "viewer"]


class ProjectPermissionBase(BaseModel):
    """Base permission flags plus access-level key for project access grants."""
    access_level: ProjectAccessLevel = "viewer"
    can_view: bool = False
    can_edit: bool = False
    can_add_update: bool = False
    can_add_funding: bool = False
    can_manage_access: bool = False


class ProjectPermissionGrant(ProjectPermissionBase):
    """Payload for creating or updating a project permission grant."""
    user_id: int


class ProjectPermissionOut(ProjectPermissionBase):
    """Response payload for project permission entries with resolved overrides."""
    id: int
    project_id: int
    user_id: int
    granted_by_user_id: int
    user_email: str
    user_full_name: str | None
    user_role: str
    override_can_view: bool | None = None
    override_can_edit: bool | None = None
    override_can_add_update: bool | None = None
    override_can_add_funding: bool | None = None
    override_can_manage_access: bool | None = None
    created_at: datetime
    updated_at: datetime


class ProjectVersionOut(BaseModel):
    """Response row for project version history."""
    id: int
    project_id: int
    actor_user_id: int
    reason: str
    created_at: datetime


class ProjectFieldOptionsOut(BaseModel):
    """Bundled option lists used by project forms."""
    institution: list[str]
    domain: list[str]
    ai_type: list[str]
    lifecycle_stage: list[str]
    trl_level: list[str]
    trc_category: list[str]


class ProjectOptionCreate(BaseModel):
    """Payload for creating a standardized option entry."""
    name: str = Field(min_length=1, max_length=128)


class ProjectOptionOut(BaseModel):
    """Response payload for a standardized option entry."""
    id: int
    name: str
    created_by_user_id: int | None
    created_at: datetime
