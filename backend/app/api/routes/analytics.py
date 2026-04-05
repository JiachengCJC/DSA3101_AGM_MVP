from collections import Counter, defaultdict
from datetime import date, datetime, time, timezone
import re

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_role
from app.models.audit import ProjectUpdate
from app.models.project import Project
from app.schemas.analytics import (
    CountByKey,
    FundingByInstitutionDomain,
    FundingByKey,
    OverdueOrInactiveProject,
    PortfolioSnapshot,
    ProjectCycle,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])

OVERDUE_UPDATE_DAYS = 30
INACTIVE_PROJECT_DAYS = 90


def _clean_key(value: str | None) -> str:
    cleaned = (value or "").strip()
    return cleaned if cleaned else "Unknown"


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _counts_from_values(values: list[str]) -> list[CountByKey]:
    counter: Counter[str] = Counter(values)
    return [
        CountByKey(key=key, count=count)
        for key, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))
    ]


def _count_by(projects: list[Project], key_fn) -> list[CountByKey]:
    values = [_clean_key(key_fn(project)) for project in projects]
    return _counts_from_values(values)


def _funding_by(projects: list[Project], key_fn) -> list[FundingByKey]:
    totals: defaultdict[str, float] = defaultdict(float)
    for project in projects:
        totals[_clean_key(key_fn(project))] += float(project.funding_amount_sgd or 0)
    return [
        FundingByKey(key=key, amount_sgd=amount)
        for key, amount in sorted(totals.items(), key=lambda item: (-item[1], item[0]))
    ]


def _funding_by_institution_and_domain(projects: list[Project]) -> list[FundingByInstitutionDomain]:
    totals: defaultdict[tuple[str, str], float] = defaultdict(float)
    for project in projects:
        institution = _clean_key(project.institution)
        domain = _clean_key(project.domain)
        totals[(institution, domain)] += float(project.funding_amount_sgd or 0)

    rows = sorted(totals.items(), key=lambda item: (-item[1], item[0][0], item[0][1]))
    return [
        FundingByInstitutionDomain(
            institution=institution,
            domain=domain,
            amount_sgd=amount,
        )
        for (institution, domain), amount in rows
    ]


def _parse_trl_level(trl_level: str | None) -> int | None:
    if not trl_level:
        return None
    match = re.search(r"trl\s*(\d+)", trl_level, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _deployment_status(project: Project) -> str:
    if project.end_date is not None:
        return "Completed"

    trl_level = _parse_trl_level(project.trl_level)
    if trl_level is None:
        return "Unknown"
    if trl_level >= 9:
        return "Deployed"
    if trl_level >= 7:
        return "Pre-deployment"
    if trl_level >= 4:
        return "Validation"
    return "Discovery"


def _governance_status(project: Project) -> str:
    collaboration = _clean_key(project.collaboration_formal_signed).lower()
    has_ai_office = bool((project.ai_office_involvement or "").strip())

    if collaboration == "signed" and has_ai_office:
        return "On Track"
    if collaboration in {"signed", "in review"} or has_ai_office:
        return "In Progress"
    return "Needs Attention"


def _project_due_date(project: Project) -> date | None:
    return project.grant_end_date


def _project_activity_flags(
    project: Project,
    now: datetime,
    completed_project_ids: set[int],
) -> tuple[int, bool, bool, bool, date | None, datetime]:
    last_activity = _to_utc(project.updated_at) or _to_utc(project.created_at) or now
    days_since_update = max((now.date() - last_activity.date()).days, 0)

    is_completed = project.id in completed_project_ids
    due_date = _project_due_date(project)
    is_past_due = bool(due_date and due_date < now.date() and not is_completed)
    is_overdue_update = not is_completed and days_since_update > OVERDUE_UPDATE_DAYS
    is_inactive = not is_completed and days_since_update > INACTIVE_PROJECT_DAYS

    return days_since_update, is_overdue_update, is_inactive, is_past_due, due_date, last_activity


def _risk_level(project: Project, days_since_update: int, is_past_due: bool) -> str:
    score = 0

    if days_since_update > INACTIVE_PROJECT_DAYS:
        score += 2
    elif days_since_update > OVERDUE_UPDATE_DAYS:
        score += 1

    if is_past_due:
        score += 2

    trl_level = _parse_trl_level(project.trl_level)
    if trl_level is not None and trl_level <= 3:
        score += 1

    if not (project.ai_office_involvement or "").strip():
        score += 1

    if score >= 4:
        return "High"
    if score >= 2:
        return "Medium"
    return "Low"


def _project_cycles(
    projects: list[Project],
    completed_at_by_project: dict[int, datetime],
    now: datetime,
) -> list[ProjectCycle]:
    rows: list[ProjectCycle] = []

    for project in projects:
        start_time = _to_utc(project.created_at) or now

        end_time = _to_utc(completed_at_by_project.get(project.id))
        if end_time is None and project.end_date is not None:
            if isinstance(project.end_date, datetime):
                end_time = _to_utc(project.end_date)
            else:
                end_time = datetime.combine(project.end_date, time.max, tzinfo=timezone.utc)

        duration_end = end_time or now
        duration_days = max((duration_end.date() - start_time.date()).days, 0)

        updated_at = _to_utc(project.updated_at) or start_time

        rows.append(
            ProjectCycle(
                id=project.id,
                title=project.title,
                institution=_clean_key(project.institution),
                domain=_clean_key(project.domain),
                lifecycle_stage=_clean_key(project.lifecycle_stage),
                trl_level=_clean_key(project.trl_level),
                trc_category=_clean_key(project.trc_category),
                start_time=start_time.isoformat(),
                end_time=end_time.isoformat() if end_time else None,
                updated_at=updated_at.isoformat(),
                grant_end_date=project.grant_end_date.isoformat() if project.grant_end_date else None,
                duration_days=duration_days,
                spent_sgd=float(project.funding_amount_sgd or 0),
            )
        )

    return rows


def _overdue_or_inactive_projects(
    projects: list[Project],
    now: datetime,
    completed_project_ids: set[int],
) -> list[OverdueOrInactiveProject]:
    rows: list[OverdueOrInactiveProject] = []

    for project in projects:
        (
            days_since_update,
            is_overdue_update,
            is_inactive,
            is_past_due,
            due_date,
            last_activity,
        ) = _project_activity_flags(project, now, completed_project_ids)

        deployment_status = _deployment_status(project)
        governance_status = _governance_status(project)
        risk_level = _risk_level(project, days_since_update, is_past_due)

        if not (is_overdue_update or is_inactive or is_past_due):
            continue

        rows.append(
            OverdueOrInactiveProject(
                id=project.id,
                title=project.title,
                institution=_clean_key(project.institution),
                domain=_clean_key(project.domain),
                updated_at=last_activity.isoformat(),
                days_since_update=days_since_update,
                is_overdue_update=is_overdue_update,
                is_inactive=is_inactive,
                is_past_due=is_past_due,
                due_date=due_date.isoformat() if due_date else None,
                deployment_status=deployment_status,
                governance_status=governance_status,
                risk_level=risk_level,
                spent_sgd=float(project.funding_amount_sgd or 0),
            )
        )

    rows.sort(
        key=lambda row: (
            not row.is_past_due,
            not row.is_inactive,
            not row.is_overdue_update,
            -row.days_since_update,
            row.title.lower(),
        )
    )
    return rows


@router.get("/portfolio", response_model=PortfolioSnapshot)
def portfolio_snapshot(
    db: Session = Depends(get_db),
    _user=Depends(require_role("management", "admin")),
):
    now = datetime.now(timezone.utc)
    projects = db.query(Project).order_by(Project.created_at.desc()).all()

    completed_rows = (
        db.query(ProjectUpdate.project_id, func.max(ProjectUpdate.created_at))
        .filter(ProjectUpdate.status == "Completed")
        .group_by(ProjectUpdate.project_id)
        .all()
    )
    completed_at_by_project = {project_id: completed_at for project_id, completed_at in completed_rows}
    completed_project_ids = set(completed_at_by_project.keys())
    completed_project_ids.update(project.id for project in projects if project.end_date is not None)

    deployment_values: list[str] = []
    governance_values: list[str] = []
    risk_values: list[str] = []

    for project in projects:
        days_since_update, _, _, is_past_due, _, _ = _project_activity_flags(project, now, completed_project_ids)
        deployment_values.append(_deployment_status(project))
        governance_values.append(_governance_status(project))
        risk_values.append(_risk_level(project, days_since_update, is_past_due))

    overdue_projects = _overdue_or_inactive_projects(projects, now, completed_project_ids)
    total_spent = sum(float(project.funding_amount_sgd or 0) for project in projects)
    active_projects = max(len(projects) - len(completed_project_ids), 0)

    return PortfolioSnapshot(
        total_projects=len(projects),
        active_projects=active_projects,
        total_spent_sgd=float(total_spent),
        by_institution=_count_by(projects, lambda project: project.institution),
        by_domain=_count_by(projects, lambda project: project.domain),
        by_lifecycle_stage=_count_by(projects, lambda project: project.lifecycle_stage),
        by_deployment_status=_counts_from_values(deployment_values),
        by_governance_status=_counts_from_values(governance_values),
        by_risk_level=_counts_from_values(risk_values),
        overdue_or_inactive_count=len(overdue_projects),
        funding_by_domain=_funding_by(projects, lambda project: project.domain),
        funding_by_institution=_funding_by(projects, lambda project: project.institution),
        funding_by_institution_and_domain=_funding_by_institution_and_domain(projects),
        overdue_or_inactive_projects=overdue_projects,
        project_cycles=_project_cycles(projects, completed_at_by_project, now),
    )
