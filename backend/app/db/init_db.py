from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.session import SessionLocal, engine

# Import models so SQLAlchemy knows about them before creating tables.
from app.models import user  # noqa: F401
from app.models import project  # noqa: F401
from app.models import project_option  # noqa: F401
from app.models import access  # noqa: F401
from app.models import audit  # noqa: F401
from app.models import login_otp  # noqa: F401
from app.models import trusted_device  # noqa: F401
from app.models.access import (
    PROJECT_ACCESS_LEVEL_DEFINITIONS,
    PROJECT_PERMISSION_FIELDS,
    ProjectAccessLevel,
    ProjectPermission,
)


def _ensure_project_schema_columns() -> None:
    # Minimal runtime schema migration for existing project databases.
    if engine.dialect.name != "postgresql":
        return

    with engine.begin() as conn:
        table_names = set(inspect(conn).get_table_names())
        if "projects" not in table_names:
            return

        project_columns = inspect(conn).get_columns("projects")
        existing = {col["name"] for col in project_columns}

        add_column_sql: dict[str, str] = {
            "lifecycle_stage": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(128) NOT NULL DEFAULT 'Research & ideation'",
            "trl_level": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS trl_level VARCHAR(128) NOT NULL DEFAULT 'TRL 1 - basic concept'",
            "trc_category": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS trc_category VARCHAR(64) NOT NULL DEFAULT 'Research'",
            "funds_received": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS funds_received TEXT",
            "funding_scope": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS funding_scope TEXT",
            "grant_year_obtained": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS grant_year_obtained INTEGER",
            "grant_start_date": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS grant_start_date DATE",
            "grant_end_date": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS grant_end_date DATE",
            "collaboration_formal_signed": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS collaboration_formal_signed TEXT",
            "collaboration_formal_partner": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS collaboration_formal_partner VARCHAR(255)",
            "collaboration_formal_scope": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS collaboration_formal_scope TEXT",
            "collaboration_informal_partner": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS collaboration_informal_partner VARCHAR(255)",
            "collaboration_informal_scope": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS collaboration_informal_scope TEXT",
            "patent_count": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS patent_count INTEGER",
            "publication": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS publication TEXT",
            "possible_synergy": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS possible_synergy TEXT",
            "ai_office_involvement": "ALTER TABLE projects ADD COLUMN IF NOT EXISTS ai_office_involvement TEXT",
        }

        for col, stmt in add_column_sql.items():
            if col not in existing:
                conn.execute(text(stmt))

        # Ensure `end_date` stores timestamp values (with time) for project completion events.
        end_date_column = next((col for col in project_columns if col["name"] == "end_date"), None)
        if end_date_column is not None:
            end_date_type = str(end_date_column.get("type", "")).upper()
            if "TIMESTAMP" not in end_date_type and "DATETIME" not in end_date_type:
                conn.execute(
                    text(
                        """
                        ALTER TABLE projects
                        ALTER COLUMN end_date TYPE TIMESTAMPTZ
                        USING CASE
                          WHEN end_date IS NULL THEN NULL
                          ELSE end_date::timestamptz
                        END
                        """
                    )
                )


def _cleanup_legacy_schema() -> None:
    # Keep schema aligned with current product requirements on existing DBs.
    if engine.dialect.name != "postgresql":
        return

    with engine.begin() as conn:
        existing = {col["name"] for col in inspect(conn).get_columns("projects")}
        for col in ("risk_level", "compliance_status", "approvals"):
            if col in existing:
                conn.execute(text(f"ALTER TABLE projects DROP COLUMN IF EXISTS {col}"))

        permission_columns = {col["name"] for col in inspect(conn).get_columns("project_permissions")}
        if "can_record_audio" in permission_columns:
            conn.execute(text("ALTER TABLE project_permissions DROP COLUMN IF EXISTS can_record_audio"))

        conn.execute(text("DROP TABLE IF EXISTS project_audio_logs"))


def _ensure_project_permission_role_columns() -> None:
    # Minimal runtime migration for existing permission databases.
    with engine.begin() as conn:
        table_names = set(inspect(conn).get_table_names())
        if "project_permissions" not in table_names:
            return

        existing = {col["name"] for col in inspect(conn).get_columns("project_permissions")}
        if engine.dialect.name == "postgresql":
            add_column_sql: dict[str, str] = {
                "access_level_key": "ALTER TABLE project_permissions ADD COLUMN IF NOT EXISTS access_level_key VARCHAR(64)",
                "override_can_view": "ALTER TABLE project_permissions ADD COLUMN IF NOT EXISTS override_can_view BOOLEAN",
                "override_can_edit": "ALTER TABLE project_permissions ADD COLUMN IF NOT EXISTS override_can_edit BOOLEAN",
                "override_can_add_update": "ALTER TABLE project_permissions ADD COLUMN IF NOT EXISTS override_can_add_update BOOLEAN",
                "override_can_add_funding": "ALTER TABLE project_permissions ADD COLUMN IF NOT EXISTS override_can_add_funding BOOLEAN",
                "override_can_manage_access": "ALTER TABLE project_permissions ADD COLUMN IF NOT EXISTS override_can_manage_access BOOLEAN",
            }
        else:
            add_column_sql = {
                "access_level_key": "ALTER TABLE project_permissions ADD COLUMN access_level_key VARCHAR(64)",
                "override_can_view": "ALTER TABLE project_permissions ADD COLUMN override_can_view BOOLEAN",
                "override_can_edit": "ALTER TABLE project_permissions ADD COLUMN override_can_edit BOOLEAN",
                "override_can_add_update": "ALTER TABLE project_permissions ADD COLUMN override_can_add_update BOOLEAN",
                "override_can_add_funding": "ALTER TABLE project_permissions ADD COLUMN override_can_add_funding BOOLEAN",
                "override_can_manage_access": "ALTER TABLE project_permissions ADD COLUMN override_can_manage_access BOOLEAN",
            }
        for col, stmt in add_column_sql.items():
            if col not in existing:
                conn.execute(text(stmt))
        if engine.dialect.name == "postgresql":
            conn.execute(text("ALTER TABLE project_permissions ALTER COLUMN access_level_key SET DEFAULT 'viewer'"))


def _ensure_login_otp_columns() -> None:
    with engine.begin() as conn:
        table_names = set(inspect(conn).get_table_names())
        if "login_otp_challenges" not in table_names:
            return

        existing = {col["name"] for col in inspect(conn).get_columns("login_otp_challenges")}
        if engine.dialect.name == "postgresql":
            add_column_sql: dict[str, str] = {
                "purpose": "ALTER TABLE login_otp_challenges ADD COLUMN IF NOT EXISTS purpose VARCHAR(32) NOT NULL DEFAULT 'login'",
                "pending_password_hash": "ALTER TABLE login_otp_challenges ADD COLUMN IF NOT EXISTS pending_password_hash VARCHAR(255)",
            }
        else:
            add_column_sql = {
                "purpose": "ALTER TABLE login_otp_challenges ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'login'",
                "pending_password_hash": "ALTER TABLE login_otp_challenges ADD COLUMN pending_password_hash VARCHAR(255)",
            }

        for col, stmt in add_column_sql.items():
            if col not in existing:
                conn.execute(text(stmt))


def _seed_project_access_levels() -> None:
    db = SessionLocal()
    try:
        for key, definition in PROJECT_ACCESS_LEVEL_DEFINITIONS.items():
            permissions = definition.get("permissions", {})
            row = db.query(ProjectAccessLevel).filter(ProjectAccessLevel.key == key).first()
            if row is None:
                row = ProjectAccessLevel(key=key)
                db.add(row)

            row.label = str(definition.get("label", key))
            row.description = definition.get("description")
            for field in PROJECT_PERMISSION_FIELDS:
                setattr(row, field, bool(permissions.get(field, False)))
        db.commit()
    finally:
        db.close()


def _closest_access_level_key(effective_permissions: dict[str, bool]) -> str:
    best_key = "viewer"
    best_distance = 10**9
    for key, definition in PROJECT_ACCESS_LEVEL_DEFINITIONS.items():
        defaults = definition.get("permissions", {})
        distance = sum(
            int(bool(defaults.get(field, False)) != bool(effective_permissions[field]))
            for field in PROJECT_PERMISSION_FIELDS
        )
        if distance < best_distance:
            best_key = key
            best_distance = distance
    return best_key


def _backfill_project_permission_access_levels() -> None:
    db = SessionLocal()
    try:
        rows = db.query(ProjectPermission).all()
        changed = False
        for permission in rows:
            if permission.access_level_key:
                access_level_key = permission.access_level_key
            else:
                effective = {field: bool(getattr(permission, field, False)) for field in PROJECT_PERMISSION_FIELDS}
                access_level_key = _closest_access_level_key(effective)
                defaults = PROJECT_ACCESS_LEVEL_DEFINITIONS[access_level_key]["permissions"]

                permission.access_level_key = access_level_key
                for field in PROJECT_PERMISSION_FIELDS:
                    override_attr = f"override_{field}"
                    if effective[field] == bool(defaults.get(field, False)):
                        setattr(permission, override_attr, None)
                    else:
                        setattr(permission, override_attr, effective[field])
                changed = True

            if access_level_key not in PROJECT_ACCESS_LEVEL_DEFINITIONS:
                access_level_key = "viewer"
                if permission.access_level_key != "viewer":
                    permission.access_level_key = "viewer"
                    changed = True

            defaults = PROJECT_ACCESS_LEVEL_DEFINITIONS[access_level_key]["permissions"]
            for field in PROJECT_PERMISSION_FIELDS:
                override_value = getattr(permission, f"override_{field}", None)
                resolved_value = bool(defaults.get(field, False)) if override_value is None else bool(override_value)
                if bool(getattr(permission, field, False)) != resolved_value:
                    setattr(permission, field, resolved_value)
                    changed = True

        if changed:
            db.commit()
    finally:
        db.close()


def init_db() -> None:
    # For MVP simplicity: create tables if they don't exist.
    # In production, use Alembic migrations.
    Base.metadata.create_all(bind=engine)
    _ensure_project_schema_columns()
    _ensure_project_permission_role_columns()
    _ensure_login_otp_columns()
    _cleanup_legacy_schema()
    _seed_project_access_levels()
    _backfill_project_permission_access_levels()
    # It only creates tables.

"""
How it fits in the Startup Flow
1. Docker starts the Postgres container.

2. FastAPI starts the Backend container.

3. FastAPI triggers the @app.on_event("startup") function.

4. That function calls init_db().

5. init_db() builds your tables so that when the very next line calls _seed_users(), 
the "User" table is ready and waiting.
"""
