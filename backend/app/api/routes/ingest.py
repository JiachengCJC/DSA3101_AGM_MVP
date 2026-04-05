import csv
import io
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_role
from app.models.access import ProjectVersion
from app.models.project import Project
from app.models.audit import AuditLog

router = APIRouter(prefix="/integrations", tags=["integrations"])

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


def _project_snapshot(project: Project) -> dict[str, str | float | int | None]:
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


@router.post("/amgrant/ingest")
async def ingest_amgrant_csv(
    file: UploadFile = File(..., description="Mock AMGrant export as CSV"),
    db: Session = Depends(get_db),
    user=Depends(require_role("management", "admin")),
):
    """Read-only integration MVP.

    Expected columns (mocked):
    - title,institution,domain,ai_type,lifecycle_stage,trl_level,trc_category,funding_amount_sgd,grant_year_obtained

    For conflicts: we create a new Project if exact title+institution does not exist; otherwise update fields.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    content = (await file.read()).decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(content))

    created = 0
    updated = 0

    def parse_date(raw: str | None):
        value = (raw or "").strip()
        if not value:
            return None
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None

    for row in reader:
        title = (row.get("title") or "").strip()
        institution = (row.get("institution") or "").strip()

        # If the row is missing a title or institution (maybe 
        # it's a blank row at the end of the file), it skips it and moves to the next one.
        if not title or not institution:
            continue

        project = (
            db.query(Project)
            .filter(Project.title == title)
            .filter(Project.institution == institution)
            .first()
        )

        # The or "Default Value" logic ensures that if the CSV leaves a cell blank, 
        # your database won't complain about missing data; 
        # it will just slot in a safe default (like "General" or "Medium").
        fields = {
            "domain": (row.get("domain") or "General").strip(),
            "ai_type": (row.get("ai_type") or "Unknown").strip(),
            "lifecycle_stage": (row.get("lifecycle_stage") or "Research & ideation").strip(),
            "trl_level": (row.get("trl_level") or "TRL 1 - basic concept").strip(),
            "trc_category": (row.get("trc_category") or "Research").strip(),
            "funds_received": (row.get("funds_received") or "").strip() or None,
            "funding_scope": (row.get("funding_scope") or "").strip() or None,
            "collaboration_formal_signed": (row.get("collaboration_formal_signed") or "").strip() or None,
            "collaboration_formal_partner": (row.get("collaboration_formal_partner") or "").strip() or None,
            "collaboration_formal_scope": (row.get("collaboration_formal_scope") or "").strip() or None,
            "collaboration_informal_partner": (row.get("collaboration_informal_partner") or "").strip() or None,
            "collaboration_informal_scope": (row.get("collaboration_informal_scope") or "").strip() or None,
            "publication": (row.get("publication") or "").strip() or None,
            "possible_synergy": (row.get("possible_synergy") or "").strip() or None,
            "ai_office_involvement": (row.get("ai_office_involvement") or "").strip() or None,
        }

        fields["grant_start_date"] = parse_date(row.get("grant_start_date"))
        fields["grant_end_date"] = parse_date(row.get("grant_end_date"))

        grant_year_obtained_raw = (row.get("grant_year_obtained") or "").strip()
        if grant_year_obtained_raw:
            try:
                fields["grant_year_obtained"] = int(grant_year_obtained_raw)
            except ValueError:
                pass

        patent_count_raw = (row.get("patent_count") or "").strip()
        if patent_count_raw:
            try:
                fields["patent_count"] = int(patent_count_raw)
            except ValueError:
                pass

        funding_raw = (row.get("funding_amount_sgd") or "").strip()
        if funding_raw:
            try:
                fields["funding_amount_sgd"] = float(funding_raw)
            except ValueError:
                pass

        # If the database lookup earlier found nothing, we create a new Project
        if project is None:
            # For MVP: ingested projects owned by management user to keep simple.
            project = Project(
                title=title,
                institution=institution,
                owner_id=user.id,
                start_date=date.today(),
                **fields,
            )
            db.add(project)
            db.flush()
            db.add(
                AuditLog(
                    actor_user_id=user.id,
                    action="INGEST",
                    entity_type="Project",
                    entity_id=project.id,
                    diff_json=AuditLog.dumps({"source": file.filename, "row": row}),
                )
            )
            db.add(
                ProjectVersion(
                    project_id=project.id,
                    actor_user_id=user.id,
                    reason="INGEST_CREATE",
                    snapshot_json=AuditLog.dumps(_project_snapshot(project)),
                )
            )
            created += 1
        else:
            for k, v in fields.items():
                setattr(project, k, v)
            db.add(
                AuditLog(
                    actor_user_id=user.id,
                    action="INGEST",
                    entity_type="Project",
                    entity_id=project.id,
                    diff_json=AuditLog.dumps({"source": file.filename, "row": row}),
                )
            )
            db.add(
                ProjectVersion(
                    project_id=project.id,
                    actor_user_id=user.id,
                    reason="INGEST_UPDATE",
                    snapshot_json=AuditLog.dumps(_project_snapshot(project)),
                )
            )
            updated += 1

    db.commit()
    return {"created": created, "updated": updated}
