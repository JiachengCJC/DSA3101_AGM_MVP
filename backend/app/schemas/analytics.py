"""Pydantic response schemas for analytics endpoints."""

from pydantic import BaseModel


class CountByKey(BaseModel):
    """Generic analytics row for grouped counts."""
    key: str
    count: int


class FundingByKey(BaseModel):
    """Grouped funding total keyed by a single dimension."""
    key: str
    amount_sgd: float


class FundingByInstitutionDomain(BaseModel):
    """Funding total keyed by institution and domain pair."""
    institution: str
    domain: str
    amount_sgd: float


class ProjectCycle(BaseModel):
    """Lifecycle timing and spend details for one project."""
    id: int
    title: str
    institution: str
    domain: str
    lifecycle_stage: str
    trl_level: str
    trc_category: str
    start_time: str
    end_time: str | None
    updated_at: str
    grant_end_date: str | None
    duration_days: int
    spent_sgd: float


class OverdueOrInactiveProject(BaseModel):
    """Risk-focused projection of projects needing attention."""
    id: int
    title: str
    institution: str
    domain: str
    updated_at: str
    days_since_update: int
    is_overdue_update: bool
    is_inactive: bool
    is_past_due: bool
    due_date: str | None
    deployment_status: str
    governance_status: str
    risk_level: str
    spent_sgd: float


class PortfolioSnapshot(BaseModel):
    """Top-level analytics response aggregating KPIs and detailed breakdowns."""
    total_projects: int
    active_projects: int
    total_spent_sgd: float
    by_institution: list[CountByKey]
    by_domain: list[CountByKey]
    by_lifecycle_stage: list[CountByKey]
    by_deployment_status: list[CountByKey]
    by_governance_status: list[CountByKey]
    by_risk_level: list[CountByKey]
    overdue_or_inactive_count: int
    funding_by_domain: list[FundingByKey]
    funding_by_institution: list[FundingByKey]
    funding_by_institution_and_domain: list[FundingByInstitutionDomain]
    overdue_or_inactive_projects: list[OverdueOrInactiveProject]
    project_cycles: list[ProjectCycle]
