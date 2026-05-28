"""Project CRUD, funding, updates, permissions, and version-restore endpoints."""

import json
from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.models.access import (
    PROJECT_ACCESS_LEVEL_DEFINITIONS,
    PROJECT_PERMISSION_FIELDS,
    ProjectAccessLevel,
    ProjectPermission,
    ProjectVersion,
)
from app.models.audit import AuditLog, ProjectFundingEvent, ProjectUpdate
from app.models.project import Project
from app.models.project_option import (
    AITypeOption,
    DomainOption,
    InstitutionOption,
    LifecycleStageOption,
    TrcCategoryOption,
    TrlLevelOption,
)
from app.models.user import User
from app.schemas.auth import UserOut
from app.schemas.project import (
    ProjectCreate,
    ProjectEndRequest,
    ProjectFieldOptionsOut,
    ProjectFundingEventCreate,
    ProjectFundingEventOut,
    ProjectListItem,
    ProjectOut,
    ProjectPermissionGrant,
    ProjectPermissionOut,
    ProjectPersonBrief,
    ProjectOptionCreate,
    ProjectOptionOut,
    ProjectUpdate as ProjectUpdateSchema,
    ProjectUpdateCreate,
    ProjectUpdateOut,
    ProjectVersionOut,
)

router = APIRouter(prefix="/projects", tags=["projects"])

SNAPSHOT_FIELDS = (
    "title",
    "institution",
    "domain",
    "ai_type",
    "lifecycle_stage",
    "trl_level",
    "trc_category",
    "funding_amount_sgd",
    "funds_received",
    "funding_scope",
    "grant_year_obtained",
    "grant_start_date",
    "grant_end_date",
    "start_date",
    "end_date",
    "collaboration_formal_signed",
    "collaboration_formal_partner",
    "collaboration_formal_scope",
    "collaboration_informal_partner",
    "collaboration_informal_scope",
    "patent_count",
    "publication",
    "possible_synergy",
    "ai_office_involvement",
    "description",
)

DEFAULT_PROJECT_FIELD_OPTIONS: dict[str, list[str]] = {
    "institution": [
        'Changi General Hospital (CGH)', 
        'KK Women’s and Children’s Hospital (KKH)', 
        'National Cancer Center Singapore (NCCS)', 
        'National Dental Center Singapore (NDCS)', 
        'National Heart Center Singapore (NHCS)', 
        'National Neuroscience Institute (NNI)', 
        'Outram Community Hospitals (OCH)', 
        'Singapore General Hospital (SGH)', 
        'Singapore National Eye Center (SNEC)', 
        'SingHealth', 
        'SingHealth Polyclinics (SHP)', 
        'Sengkang General Hospital (SKH)',
    ],
    "domain": [
        "Radiology",
        "Oncology",
        "Cardiology",
        "Pathology",
        "Population Health",
        "Clinical Decision Support",
        "Operations",
    ],
    "ai_type": [
        "Computer Vision",
        "Natural Language Processing",
        "Predictive Analytics",
        "Generative AI",
        "Recommender System",
        "Optimization",
    ],
    "lifecycle_stage": [
        "Research & ideation",
        "Design & validation",
        "IP Generation & Productization",
        "Market entry & Growth",
    ],
    "trl_level": [
        "TRL 1 - basic concept",
        "TRL 2 - concept formulation",
        "TRL 3 - proof of concept",
        "TRL 4 - lab validation",
        "TRL 5 - prototype validation",
        "TRL 6 - pilot testing",
        "TRL 7 - system prototype",
        "TRL 8 - complete system",
        "TRL 9 - deployed system",
    ],
    "trc_category": [
        "Research",
        "Development",
        "Validation",
        "Commercialisation",
        "Licensing",
        "Spin-off",
    ],
}

# records an event in the auditlog for project-related actions, with optional JSON diff data for updates.
def _log(db: Session, actor_user_id: int, action: str, entity_type: str, entity_id: int, diff: dict | None = None):
    """Append an audit-log row for project-domain actions without committing immediately."""
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            diff_json=AuditLog.dumps(diff) if diff else None,
        )
    )


def _get_project_or_404(db: Session, project_id: int) -> Project:
    """Load a project by ID or raise HTTP 404 when missing."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _is_admin(user: User) -> bool:
    """Return `True` when the user has the admin role."""
    return user.role == "admin"


def _is_owner(project: Project, user: User) -> bool:
    """Return `True` when the user owns the project."""
    return project.owner_id == user.id

# check if a user has access to a project by loading their explicit permission row, and evaluating it with ownership/admin status and access-level defaults.
def _permission_row(db: Session, project_id: int, user_id: int) -> ProjectPermission | None:
    """Return the explicit project-permission row for a user, if one exists."""
    return (
        db.query(ProjectPermission)
        .filter(ProjectPermission.project_id == project_id, ProjectPermission.user_id == user_id)
        .first()
    )

# normalization
def _normalize_access_level_key(access_level_key: str | None) -> str:
    """Normalize access-level aliases to canonical keys (`principal_investigator`, `team_member`, `viewer`)."""
    if not access_level_key:
        return "viewer"
    cleaned = access_level_key.strip().lower().replace("-", "_")
    aliases = {
        "pi": "principal_investigator",
        "principalinvestigator": "principal_investigator",
        "principal investigator": "principal_investigator",
        "team": "team_member",
        "teammember": "team_member",
        "team member": "team_member",
        "member": "team_member",
    }
    normalized = aliases.get(cleaned, cleaned)
    if normalized in PROJECT_ACCESS_LEVEL_DEFINITIONS:
        return normalized
    return "viewer"


def _access_levels_map(db: Session) -> dict[str, ProjectAccessLevel]:
    """Load all access-level definitions into a dictionary keyed by access-level key."""
    rows = db.query(ProjectAccessLevel).all()
    return {row.key: row for row in rows}


def _default_permissions_for_level(access_level_key: str) -> dict[str, bool]:
    """Return default permission flags for an access-level key."""
    definition = PROJECT_ACCESS_LEVEL_DEFINITIONS.get(
        _normalize_access_level_key(access_level_key),
        PROJECT_ACCESS_LEVEL_DEFINITIONS["viewer"],
    )
    defaults = definition.get("permissions", {})
    return {field: bool(defaults.get(field, False)) for field in PROJECT_PERMISSION_FIELDS}


def _permissions_for_level(
    access_levels: dict[str, ProjectAccessLevel],
    access_level_key: str,
) -> dict[str, bool]:
    """Return effective defaults for an access level from DB-backed definitions, with fallback defaults."""
    normalized = _normalize_access_level_key(access_level_key)
    access_level = access_levels.get(normalized)
    if not access_level:
        return _default_permissions_for_level(normalized)
    return {field: bool(getattr(access_level, field, False)) for field in PROJECT_PERMISSION_FIELDS}

# takes a role's default permissions and merges them with any custom overrides
def _effective_permission_values(
    permission: ProjectPermission,
    access_levels: dict[str, ProjectAccessLevel],
) -> dict[str, bool]:
    """Resolve permission flags by combining access-level defaults with per-user overrides."""
    if not permission.access_level_key:
        return {field: bool(getattr(permission, field, False)) for field in PROJECT_PERMISSION_FIELDS}
    defaults = _permissions_for_level(access_levels, permission.access_level_key)
    resolved: dict[str, bool] = {}
    for field in PROJECT_PERMISSION_FIELDS:
        override = getattr(permission, f"override_{field}", None)
        resolved[field] = defaults[field] if override is None else bool(override)
    return resolved


def _apply_permission_payload(
    permission: ProjectPermission,
    access_level_key: str,
    requested_permissions: dict[str, bool],
    access_levels: dict[str, ProjectAccessLevel],
) -> None:
    """Apply requested permission values, storing only non-default flags as overrides."""
    normalized_level = _normalize_access_level_key(access_level_key)
    defaults = _permissions_for_level(access_levels, normalized_level)
    permission.access_level_key = normalized_level

    for field in PROJECT_PERMISSION_FIELDS:
        requested_value = bool(requested_permissions[field])
        override_attr = f"override_{field}"
        if requested_value == defaults[field]:
            setattr(permission, override_attr, None)
        else:
            setattr(permission, override_attr, requested_value)
        setattr(permission, field, requested_value)


def _has_project_access_from_permission(
    project: Project,
    user: User,
    permission: ProjectPermission | None,
    action: str,
) -> bool:
    """Evaluate whether an actor can perform an action given ownership/admin state and permission flags."""
    if _is_admin(user) or _is_owner(project, user):
        return True
    if permission is None:
        return False

    if action == "view":
        return any(
            [
                permission.can_view,
                permission.can_edit,
                permission.can_add_update,
                permission.can_add_funding,
                permission.can_manage_access,
            ]
        )
    if action == "edit":
        return permission.can_edit
    if action == "add_update":
        return permission.can_add_update or permission.can_edit
    if action == "add_funding":
        return permission.can_add_funding or permission.can_edit
    if action == "manage_access":
        return permission.can_manage_access
    return False


def _has_project_access(db: Session, project: Project, user: User, action: str) -> bool:
    """Evaluate action authorization for a project by loading the actor's permission row."""
    permission = _permission_row(db, project.id, user.id)
    return _has_project_access_from_permission(project, user, permission, action)


def _ensure_project_access(db: Session, project: Project, user: User, action: str) -> None:
    """Raise HTTP 403 when a user lacks authorization for the requested project action."""
    if not _has_project_access(db, project, user, action):
        raise HTTPException(status_code=403, detail="Not allowed")


def _permission_map_for_user(db: Session, user_id: int, project_ids: list[int]) -> dict[int, ProjectPermission]:
    """Build a project-id to permission-row map for list endpoints."""
    if not project_ids:
        return {}
    rows = (
        db.query(ProjectPermission)
        .filter(ProjectPermission.user_id == user_id, ProjectPermission.project_id.in_(project_ids))
        .all()
    )
    return {row.project_id: row for row in rows}


def _people_involved_by_project(db: Session, project_ids: list[int]) -> dict[int, list[ProjectPersonBrief]]:
    """Collect owners and permissioned users per project for project list display."""
    if not project_ids:
        return {}

    people_map: dict[int, dict[int, ProjectPersonBrief]] = {project_id: {} for project_id in project_ids}

    owner_rows = (
        db.query(Project.id, User.id, User.email, User.full_name, User.role)
        .join(User, User.id == Project.owner_id)
        .filter(Project.id.in_(project_ids))
        .all()
    )
    for project_id, user_id, email, full_name, role in owner_rows:
        people_map[project_id][user_id] = ProjectPersonBrief(
            user_id=user_id,
            email=email,
            full_name=full_name,
            role=role,
        )

    permission_rows = (
        db.query(ProjectPermission.project_id, User.id, User.email, User.full_name, User.role)
        .join(User, User.id == ProjectPermission.user_id)
        .filter(ProjectPermission.project_id.in_(project_ids))
        .all()
    )
    for project_id, user_id, email, full_name, role in permission_rows:
        people_map[project_id][user_id] = ProjectPersonBrief(
            user_id=user_id,
            email=email,
            full_name=full_name,
            role=role,
        )

    result: dict[int, list[ProjectPersonBrief]] = {}
    for project_id, by_user in people_map.items():
        result[project_id] = sorted(
            by_user.values(),
            key=lambda person: ((person.full_name or "").lower(), person.email.lower()),
        )
    return result


def _project_snapshot(project: Project) -> dict[str, str | float | int | None]:
    """Build a normalized snapshot dict of restorable project fields."""
    snapshot: dict[str, str | float | int | None] = {}
    for field in SNAPSHOT_FIELDS:
        value = getattr(project, field)
        if isinstance(value, date):
            snapshot[field] = value.isoformat()
        elif isinstance(value, Decimal):
            snapshot[field] = str(value)
        else:
            snapshot[field] = value
    return snapshot


def _parse_end_datetime(value: str | None) -> datetime | None:
    """Parse project end-date strings into UTC datetimes for version restore."""
    if not value:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError:
        parsed_date = date.fromisoformat(normalized)
        return datetime.combine(parsed_date, time.min, tzinfo=timezone.utc)

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _save_project_version(db: Session, project: Project, actor_user_id: int, reason: str) -> None:
    """Persist a point-in-time project snapshot for version history."""
    db.add(
        ProjectVersion(
            project_id=project.id,
            actor_user_id=actor_user_id,
            reason=reason,
            snapshot_json=AuditLog.dumps(_project_snapshot(project)),
        )
    )


def _permission_to_schema(
    permission: ProjectPermission,
    user: User,
    access_levels: dict[str, ProjectAccessLevel],
) -> ProjectPermissionOut:
    """Convert a permission ORM row and user row into API response shape."""
    effective = _effective_permission_values(permission, access_levels)
    return ProjectPermissionOut(
        id=permission.id,
        project_id=permission.project_id,
        user_id=permission.user_id,
        granted_by_user_id=permission.granted_by_user_id,
        user_email=user.email,
        user_full_name=user.full_name,
        user_role=user.role,
        access_level=_normalize_access_level_key(permission.access_level_key),
        can_view=effective["can_view"],
        can_edit=effective["can_edit"],
        can_add_update=effective["can_add_update"],
        can_add_funding=effective["can_add_funding"],
        can_manage_access=effective["can_manage_access"],
        override_can_view=permission.override_can_view,
        override_can_edit=permission.override_can_edit,
        override_can_add_update=permission.override_can_add_update,
        override_can_add_funding=permission.override_can_add_funding,
        override_can_manage_access=permission.override_can_manage_access,
        created_at=permission.created_at,
        updated_at=permission.updated_at,
    )


def _merge_unique_options(*option_sets: list[str]) -> list[str]:
    """Merge option lists while preserving order and removing case-insensitive duplicates."""
    seen: set[str] = set()
    merged: list[str] = []
    for option_set in option_sets:
        for value in option_set:
            cleaned = value.strip()
            if not cleaned:
                continue
            key = cleaned.casefold()
            if key in seen:
                continue
            seen.add(key)
            merged.append(cleaned)
    return merged


def _normalize_option_name(value: str | None) -> str | None:
    """Normalize candidate option names by trimming whitespace and dropping empty values."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned


def _query_option_values(db: Session, option_model) -> list[str]:
    """Load normalized option names from an option catalog table."""
    rows = db.query(option_model.name).order_by(option_model.name.asc()).all()
    return [value for (value,) in rows if isinstance(value, str) and value.strip()]


def _query_distinct_project_values(db: Session, field) -> list[str]:
    """Load distinct non-empty values from a project column."""
    rows = db.query(field).filter(field.isnot(None)).distinct().all()
    return [value.strip() for (value,) in rows if isinstance(value, str) and value.strip()]


def _upsert_standardized_option(db: Session, option_model, raw_name: str | None, actor_user_id: int | None):
    """Find-or-create a standardized option entry using case-insensitive matching."""
    name = _normalize_option_name(raw_name)
    if not name:
        return None

    existing = db.query(option_model).filter(func.lower(option_model.name) == name.lower()).first()
    if existing:
        return existing

    option = option_model(name=name, created_by_user_id=actor_user_id)
    db.add(option)
    db.flush()
    return option


def _sync_standardized_project_options(
    db: Session,
    institution: str | None,
    domain: str | None,
    ai_type: str | None,
    lifecycle_stage: str | None,
    trl_level: str | None,
    trc_category: str | None,
    actor_user_id: int | None,
) -> None:
    """Ensure each standardized project field value exists in its option catalog table."""
    _upsert_standardized_option(db, InstitutionOption, institution, actor_user_id)
    _upsert_standardized_option(db, DomainOption, domain, actor_user_id)
    _upsert_standardized_option(db, AITypeOption, ai_type, actor_user_id)
    _upsert_standardized_option(db, LifecycleStageOption, lifecycle_stage, actor_user_id)
    _upsert_standardized_option(db, TrlLevelOption, trl_level, actor_user_id)
    _upsert_standardized_option(db, TrcCategoryOption, trc_category, actor_user_id)


def _option_to_schema(option) -> ProjectOptionOut:
    """Convert an option ORM row into `ProjectOptionOut` response payload."""
    return ProjectOptionOut(
        id=option.id,
        name=option.name,
        created_by_user_id=option.created_by_user_id,
        created_at=option.created_at,
    )


@router.get("", response_model=list[ProjectListItem])
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    q: str | None = Query(default=None, description="Search in title/category/institution"),
    institution: str | None = None,
    lifecycle_stage: str | None = None,
    trl_level: str | None = None,
    trc_category: str | None = None,
):
    """List projects with optional filters and visibility-aware field redaction."""
    query = db.query(Project)

    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (Project.title.ilike(like))
            | (Project.domain.ilike(like))
            | (Project.institution.ilike(like))
        )

    if institution:
        query = query.filter(Project.institution == institution)
    if lifecycle_stage:
        query = query.filter(Project.lifecycle_stage == lifecycle_stage)
    if trl_level:
        query = query.filter(Project.trl_level == trl_level)
    if trc_category:
        query = query.filter(Project.trc_category == trc_category)

    projects = query.order_by(Project.updated_at.desc()).all()
    project_ids = [project.id for project in projects]
    permission_map = _permission_map_for_user(db, user.id, project_ids) if not _is_admin(user) else {}
    people_map = _people_involved_by_project(db, project_ids)

    rows: list[ProjectListItem] = []
    for project in projects:
        permission = permission_map.get(project.id)
        can_view = _has_project_access_from_permission(project, user, permission, "view")

        rows.append(
            ProjectListItem(
                id=project.id,
                title=project.title,
                people_involved=people_map.get(project.id, []),
                can_view_details=can_view,
                institution=project.institution if can_view else None,
                domain=project.domain if can_view else None,
                ai_type=project.ai_type if can_view else None,
                lifecycle_stage=project.lifecycle_stage if can_view else None,
                trl_level=project.trl_level if can_view else None,
                trc_category=project.trc_category if can_view else None,
                funding_amount_sgd=project.funding_amount_sgd if can_view else None,
                updated_at=project.updated_at,
            )
        )
    return rows


@router.get("/options", response_model=ProjectFieldOptionsOut)
def list_project_field_options(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return merged project field options from defaults, option tables, and existing project values."""
    merged = {
        "institution": _merge_unique_options(
            DEFAULT_PROJECT_FIELD_OPTIONS["institution"],
            _query_option_values(db, InstitutionOption),
            _query_distinct_project_values(db, Project.institution),
        ),
        "domain": _merge_unique_options(
            DEFAULT_PROJECT_FIELD_OPTIONS["domain"],
            _query_option_values(db, DomainOption),
            _query_distinct_project_values(db, Project.domain),
        ),
        "ai_type": _merge_unique_options(
            DEFAULT_PROJECT_FIELD_OPTIONS["ai_type"],
            _query_option_values(db, AITypeOption),
            _query_distinct_project_values(db, Project.ai_type),
        ),
        "lifecycle_stage": _merge_unique_options(
            DEFAULT_PROJECT_FIELD_OPTIONS["lifecycle_stage"],
            _query_option_values(db, LifecycleStageOption),
            _query_distinct_project_values(db, Project.lifecycle_stage),
        ),
        "trl_level": _merge_unique_options(
            DEFAULT_PROJECT_FIELD_OPTIONS["trl_level"],
            _query_option_values(db, TrlLevelOption),
            _query_distinct_project_values(db, Project.trl_level),
        ),
        "trc_category": _merge_unique_options(
            DEFAULT_PROJECT_FIELD_OPTIONS["trc_category"],
            _query_option_values(db, TrcCategoryOption),
            _query_distinct_project_values(db, Project.trc_category),
        ),
    }
    return ProjectFieldOptionsOut(**merged)


@router.post("/options/institutions", response_model=ProjectOptionOut)
def create_institution_option(
    payload: ProjectOptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or reuse a normalized institution option."""
    option = _upsert_standardized_option(db, InstitutionOption, payload.name, user.id)
    if option is None:
        raise HTTPException(status_code=400, detail="Institution option cannot be empty")
    db.commit()
    db.refresh(option)
    return _option_to_schema(option)


@router.post("/options/domains", response_model=ProjectOptionOut)
def create_domain_option(
    payload: ProjectOptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or reuse a normalized domain option."""
    option = _upsert_standardized_option(db, DomainOption, payload.name, user.id)
    if option is None:
        raise HTTPException(status_code=400, detail="AI category option cannot be empty")
    db.commit()
    db.refresh(option)
    return _option_to_schema(option)


@router.post("/options/ai-types", response_model=ProjectOptionOut)
def create_ai_type_option(
    payload: ProjectOptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or reuse a normalized AI-type option."""
    option = _upsert_standardized_option(db, AITypeOption, payload.name, user.id)
    if option is None:
        raise HTTPException(status_code=400, detail="AI methodology option cannot be empty")
    db.commit()
    db.refresh(option)
    return _option_to_schema(option)


@router.post("/options/lifecycle-stages", response_model=ProjectOptionOut)
def create_lifecycle_stage_option(
    payload: ProjectOptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or reuse a normalized lifecycle-stage option."""
    option = _upsert_standardized_option(db, LifecycleStageOption, payload.name, user.id)
    if option is None:
        raise HTTPException(status_code=400, detail="Lifecycle stage option cannot be empty")
    db.commit()
    db.refresh(option)
    return _option_to_schema(option)


@router.post("/options/trl-levels", response_model=ProjectOptionOut)
def create_trl_level_option(
    payload: ProjectOptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or reuse a normalized TRL-level option."""
    option = _upsert_standardized_option(db, TrlLevelOption, payload.name, user.id)
    if option is None:
        raise HTTPException(status_code=400, detail="TRL option cannot be empty")
    db.commit()
    db.refresh(option)
    return _option_to_schema(option)


@router.post("/options/trc-categories", response_model=ProjectOptionOut)
def create_trc_category_option(
    payload: ProjectOptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create or reuse a normalized TRC-category option."""
    option = _upsert_standardized_option(db, TrcCategoryOption, payload.name, user.id)
    if option is None:
        raise HTTPException(status_code=400, detail="TRC option cannot be empty")
    db.commit()
    db.refresh(option)
    return _option_to_schema(option)

# Takes form data, standardizes the tags, saves the project, sets the creator as the owner, writes an audit log, and saves "Version 1" of the project.
@router.post("", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Create a project, sync standardized options, audit the action, and snapshot initial version state."""
    data = payload.model_dump()
    data.pop("start_date", None)
    data.pop("end_date", None)
    for field in ("institution", "domain", "ai_type", "lifecycle_stage", "trl_level", "trc_category"):
        value = data.get(field)
        if isinstance(value, str):
            data[field] = value.strip()

    _sync_standardized_project_options(
        db,
        institution=data.get("institution"),
        domain=data.get("domain"),
        ai_type=data.get("ai_type"),
        lifecycle_stage=data.get("lifecycle_stage"),
        trl_level=data.get("trl_level"),
        trc_category=data.get("trc_category"),
        actor_user_id=user.id,
    )

    project = Project(**data, owner_id=user.id)
    db.add(project)
    db.flush()

    if project.created_at is not None:
        project.start_date = project.created_at.date()
    else:
        project.start_date = date.today()

    db.commit()
    db.refresh(project)

    create_diff = data | {"start_date": str(project.start_date)}
    _log(db, user.id, "CREATE", "Project", project.id, diff=create_diff)
    _save_project_version(db, project, user.id, reason="CREATE")
    db.commit()
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return full project details after view-access authorization."""
    project = _get_project_or_404(db, project_id)
    _ensure_project_access(db, project, user, "view")
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdateSchema,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Apply partial project updates, sync options, audit diff, and write a new version snapshot."""
    project = _get_project_or_404(db, project_id)
    _ensure_project_access(db, project, user, "edit")

    data = payload.model_dump(exclude_unset=True)

    data.pop("start_date", None)
    data.pop("end_date", None)
    for field in ("institution", "domain", "ai_type", "lifecycle_stage", "trl_level", "trc_category"):
        if field in data and isinstance(data[field], str):
            data[field] = data[field].strip()

    for key, value in data.items():
        setattr(project, key, value)

    _sync_standardized_project_options(
        db,
        institution=project.institution,
        domain=project.domain,
        ai_type=project.ai_type,
        lifecycle_stage=project.lifecycle_stage,
        trl_level=project.trl_level,
        trc_category=project.trc_category,
        actor_user_id=user.id,
    )

    if project.start_date is None and project.created_at is not None:
        project.start_date = project.created_at.date()

    db.add(project)
    db.commit()
    db.refresh(project)

    _log(db, user.id, "UPDATE", "Project", project.id, diff=data)
    _save_project_version(db, project, user.id, reason="UPDATE")
    db.commit()
    return project


@router.post("/{project_id}/end", response_model=ProjectOut)
def end_project(
    project_id: int,
    payload: ProjectEndRequest | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """Mark a project completed, add completion note, and record audit/version history (admin-only)."""
    project = _get_project_or_404(db, project_id)

    if project.start_date is None and project.created_at is not None:
        project.start_date = project.created_at.date()

    if project.end_date is not None:
        return project

    project.end_date = datetime.now(timezone.utc)

    note = "Project marked as ended."
    if payload and payload.note and payload.note.strip():
        note = payload.note.strip()

    db.add(
        ProjectUpdate(
            project_id=project_id,
            author_user_id=user.id,
            status="Completed",
            note=note,
        )
    )
    db.add(project)

    _log(
        db,
        user.id,
        "UPDATE",
        "Project",
        project.id,
        diff={"end_date": project.end_date.isoformat(), "note": note},
    )
    _save_project_version(db, project, user.id, reason="END")

    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """Delete a project and audit the deletion (admin-only)."""
    project = _get_project_or_404(db, project_id)
    db.delete(project)
    _log(db, user.id, "DELETE", "Project", project.id)
    db.commit()
    return {"ok": True}


@router.post("/{project_id}/updates", response_model=ProjectUpdateOut)
def add_update(
    project_id: int,
    payload: ProjectUpdateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Attach a status/update note to a project after access checks."""
    project = _get_project_or_404(db, project_id)
    _ensure_project_access(db, project, user, "add_update")

    update = ProjectUpdate(
        project_id=project_id,
        author_user_id=user.id,
        status=payload.status,
        note=payload.note,
    )
    db.add(update)

    _log(db, user.id, "UPDATE", "Project", project_id, diff={"update": payload.model_dump()})
    db.commit()
    db.refresh(update)
    return update


@router.get("/{project_id}/updates", response_model=list[ProjectUpdateOut])
def list_updates(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List project updates in reverse chronological order."""
    project = _get_project_or_404(db, project_id)
    _ensure_project_access(db, project, user, "view")

    return (
        db.query(ProjectUpdate)
        .filter(ProjectUpdate.project_id == project_id)
        .order_by(ProjectUpdate.created_at.desc())
        .all()
    )


@router.post("/{project_id}/funding", response_model=ProjectFundingEventOut)
def add_project_funding(
    project_id: int,
    payload: ProjectFundingEventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add funding to a project, persist funding event, and record audit/version history."""
    project = _get_project_or_404(db, project_id)
    _ensure_project_access(db, project, user, "add_funding")

    amount = payload.amount_sgd
    note = payload.note.strip() if payload.note and payload.note.strip() else None

    current_total = Decimal(project.funding_amount_sgd or 0)
    project.funding_amount_sgd = current_total + amount

    event = ProjectFundingEvent(
        project_id=project_id,
        author_user_id=user.id,
        amount_sgd=amount,
        note=note,
    )
    db.add(event)
    db.add(project)

    _log(
        db,
        user.id,
        "UPDATE",
        "Project",
        project.id,
        diff={
            "funding_added_sgd": str(amount),
            "funding_total_sgd": str(project.funding_amount_sgd),
            "note": note,
        },
    )
    _save_project_version(db, project, user.id, reason="FUNDING")

    db.commit()
    db.refresh(event)
    return event


@router.get("/{project_id}/funding", response_model=list[ProjectFundingEventOut])
def list_project_funding_events(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List funding events for a project in reverse chronological order."""
    project = _get_project_or_404(db, project_id)
    _ensure_project_access(db, project, user, "view")

    return (
        db.query(ProjectFundingEvent)
        .filter(ProjectFundingEvent.project_id == project_id)
        .order_by(ProjectFundingEvent.created_at.desc())
        .all()
    )


@router.get("/{project_id}/permissions", response_model=list[ProjectPermissionOut])
def list_project_permissions(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List project permission entries with resolved effective permission values."""
    project = _get_project_or_404(db, project_id)
    if not (_is_admin(user) or _is_owner(project, user) or _has_project_access(db, project, user, "manage_access")):
        raise HTTPException(status_code=403, detail="Not allowed")

    rows = (
        db.query(ProjectPermission, User)
        .join(User, User.id == ProjectPermission.user_id)
        .filter(ProjectPermission.project_id == project_id)
        .order_by(User.email.asc())
        .all()
    )
    access_levels = _access_levels_map(db)
    return [
        _permission_to_schema(permission, permission_user, access_levels)
        for permission, permission_user in rows
    ]


@router.post("/{project_id}/permissions", response_model=ProjectPermissionOut)
def upsert_project_permission(
    project_id: int,
    payload: ProjectPermissionGrant,
    db: Session = Depends(get_db),
    actor_user: User = Depends(get_current_user),
):
    """Create or update a project permission grant with level defaults and explicit overrides."""
    project = _get_project_or_404(db, project_id)
    if not (
        _is_admin(actor_user)
        or _is_owner(project, actor_user)
        or _has_project_access(db, project, actor_user, "manage_access")
    ):
        raise HTTPException(status_code=403, detail="Not allowed")

    target_user = db.query(User).filter(User.id == payload.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if target_user.id == project.owner_id:
        raise HTTPException(status_code=400, detail="Owner already has full project access")

    access_levels = _access_levels_map(db)
    explicit_permission_inputs = payload.model_dump(include=set(PROJECT_PERMISSION_FIELDS), exclude_unset=True)
    if explicit_permission_inputs:
        requested_permissions = {
            field: bool(getattr(payload, field))
            for field in PROJECT_PERMISSION_FIELDS
        }
    else:
        requested_permissions = _permissions_for_level(access_levels, payload.access_level)

    if not any(requested_permissions.values()):
        raise HTTPException(status_code=400, detail="At least one permission must be granted")

    permission = (
        db.query(ProjectPermission)
        .filter(ProjectPermission.project_id == project_id, ProjectPermission.user_id == target_user.id)
        .first()
    )
    if permission is None:
        permission = ProjectPermission(
            project_id=project_id,
            user_id=target_user.id,
            granted_by_user_id=actor_user.id,
        )
        _apply_permission_payload(
            permission=permission,
            access_level_key=payload.access_level,
            requested_permissions=requested_permissions,
            access_levels=access_levels,
        )
        db.add(permission)
        action = "PROJECT_PERMISSION_CREATE"
    else:
        _apply_permission_payload(
            permission=permission,
            access_level_key=payload.access_level,
            requested_permissions=requested_permissions,
            access_levels=access_levels,
        )
        permission.granted_by_user_id = actor_user.id
        db.add(permission)
        action = "PROJECT_PERMISSION_UPDATE"

    db.commit()
    db.refresh(permission)

    _log(
        db,
        actor_user.id,
        action,
        "ProjectPermission",
        permission.id,
        diff={
            "project_id": project_id,
            "user_id": target_user.id,
            "access_level": permission.access_level_key,
            **requested_permissions,
            "override_can_view": permission.override_can_view,
            "override_can_edit": permission.override_can_edit,
            "override_can_add_update": permission.override_can_add_update,
            "override_can_add_funding": permission.override_can_add_funding,
            "override_can_manage_access": permission.override_can_manage_access,
        },
    )
    db.commit()
    return _permission_to_schema(permission, target_user, access_levels)


@router.delete("/{project_id}/permissions/{target_user_id}")
def delete_project_permission(
    project_id: int,
    target_user_id: int,
    db: Session = Depends(get_db),
    actor_user: User = Depends(get_current_user),
):
    """Remove a project permission grant and audit the revocation."""
    project = _get_project_or_404(db, project_id)
    if not (
        _is_admin(actor_user)
        or _is_owner(project, actor_user)
        or _has_project_access(db, project, actor_user, "manage_access")
    ):
        raise HTTPException(status_code=403, detail="Not allowed")

    if target_user_id == project.owner_id:
        raise HTTPException(status_code=400, detail="Cannot revoke project owner access")

    permission = (
        db.query(ProjectPermission)
        .filter(ProjectPermission.project_id == project_id, ProjectPermission.user_id == target_user_id)
        .first()
    )
    if not permission:
        raise HTTPException(status_code=404, detail="Permission entry not found")

    permission_id = permission.id
    db.delete(permission)
    _log(
        db,
        actor_user.id,
        "PROJECT_PERMISSION_DELETE",
        "ProjectPermission",
        permission_id,
        diff={"project_id": project_id, "user_id": target_user_id},
    )
    db.commit()
    return {"ok": True}


@router.get("/{project_id}/access-candidates", response_model=list[UserOut])
def list_project_access_candidates(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List users eligible to receive project access grants."""
    project = _get_project_or_404(db, project_id)
    if not (_is_admin(user) or _is_owner(project, user) or _has_project_access(db, project, user, "manage_access")):
        raise HTTPException(status_code=403, detail="Not allowed")
    return db.query(User).order_by(User.email.asc()).all()


@router.get("/{project_id}/versions", response_model=list[ProjectVersionOut])
def list_project_versions(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List stored project version snapshots metadata for a project."""
    project = _get_project_or_404(db, project_id)
    _ensure_project_access(db, project, user, "view")

    rows = (
        db.query(ProjectVersion)
        .filter(ProjectVersion.project_id == project_id)
        .order_by(ProjectVersion.created_at.desc())
        .all()
    )
    return [
        ProjectVersionOut(
            id=row.id,
            project_id=row.project_id,
            actor_user_id=row.actor_user_id,
            reason=row.reason,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/{project_id}/versions/{version_id}/restore", response_model=ProjectOut)
def restore_project_version(
    project_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Restore project fields from a selected snapshot and create a new restore version entry."""
    project = _get_project_or_404(db, project_id)
    _ensure_project_access(db, project, user, "edit")

    version = (
        db.query(ProjectVersion)
        .filter(ProjectVersion.project_id == project_id, ProjectVersion.id == version_id)
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    try:
        snapshot = json.loads(version.snapshot_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Project version snapshot is invalid") from exc

    for field in SNAPSHOT_FIELDS:
        if field not in snapshot:
            continue
        value = snapshot[field]
        if field == "end_date":
            value = _parse_end_datetime(value) if value else None
        elif field in {"start_date", "grant_start_date", "grant_end_date"}:
            value = date.fromisoformat(value) if value else None
        elif field == "funding_amount_sgd":
            value = Decimal(value) if value is not None else None
        setattr(project, field, value)

    if project.start_date is None and project.created_at is not None:
        project.start_date = project.created_at.date()

    _sync_standardized_project_options(
        db,
        institution=project.institution,
        domain=project.domain,
        ai_type=project.ai_type,
        lifecycle_stage=project.lifecycle_stage,
        trl_level=project.trl_level,
        trc_category=project.trc_category,
        actor_user_id=user.id,
    )

    db.add(project)
    _log(
        db,
        user.id,
        "RESTORE",
        "Project",
        project.id,
        diff={"restored_from_version_id": version_id},
    )
    _save_project_version(db, project, user.id, reason=f"RESTORE_FROM_{version_id}")
    db.commit()
    db.refresh(project)
    return project
