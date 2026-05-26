"""Convenience imports for ORM models used during metadata registration."""

from app.models.user import User
from app.models.project import Project
from app.models.project_option import (
    AITypeOption,
    DomainOption,
    InstitutionOption,
    LifecycleStageOption,
    TrcCategoryOption,
    TrlLevelOption,
)
from app.models.access import ProjectAccessLevel, ProjectPermission, ProjectVersion
from app.models.audit import AuditLog, ProjectFundingEvent, ProjectUpdate
from app.models.login_otp import LoginOtpChallenge
from app.models.trusted_device import TrustedDevice

__all__ = [
    "User",
    "Project",
    "InstitutionOption",
    "DomainOption",
    "AITypeOption",
    "LifecycleStageOption",
    "TrlLevelOption",
    "TrcCategoryOption",
    "ProjectAccessLevel",
    "ProjectPermission",
    "ProjectVersion",
    "AuditLog",
    "ProjectUpdate",
    "ProjectFundingEvent",
    "LoginOtpChallenge",
    "TrustedDevice",
]
