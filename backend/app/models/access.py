from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

PROJECT_PERMISSION_FIELDS = (
    "can_view",
    "can_edit",
    "can_add_update",
    "can_add_funding",
    "can_manage_access",
)

PROJECT_ACCESS_LEVEL_DEFINITIONS: dict[str, dict[str, object]] = {
    "principal_investigator": {
        "label": "Principal Investigator",
        "description": "Full project access and project-access administration.",
        "permissions": {
            "can_view": True,
            "can_edit": True,
            "can_add_update": True,
            "can_add_funding": True,
            "can_manage_access": True,
        },
    },
    "team_member": {
        "label": "Team Member",
        "description": "Can collaborate and contribute project updates and funding logs.",
        "permissions": {
            "can_view": True,
            "can_edit": True,
            "can_add_update": True,
            "can_add_funding": True,
            "can_manage_access": False,
        },
    },
    "viewer": {
        "label": "Viewer",
        "description": "Read-only project visibility.",
        "permissions": {
            "can_view": True,
            "can_edit": False,
            "can_add_update": False,
            "can_add_funding": False,
            "can_manage_access": False,
        },
    },
}


class ProjectAccessLevel(Base):
    __tablename__ = "project_access_levels"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    can_view: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_edit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_add_update: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_add_funding: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_manage_access: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    permissions = relationship("ProjectPermission", back_populates="access_level")


class ProjectPermission(Base):
    __tablename__ = "project_permissions"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_permission_project_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    granted_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    access_level_key: Mapped[str] = mapped_column(
        ForeignKey("project_access_levels.key"),
        nullable=False,
        default="viewer",
        index=True,
    )

    override_can_view: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    override_can_edit: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    override_can_add_update: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    override_can_add_funding: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    override_can_manage_access: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Effective access flags (materialized after applying role + overrides).
    can_view: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_edit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_add_update: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_add_funding: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    can_manage_access: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="permissions")
    access_level = relationship("ProjectAccessLevel", back_populates="permissions")
    user = relationship("User", foreign_keys=[user_id])
    granted_by = relationship("User", foreign_keys=[granted_by_user_id])


class ProjectVersion(Base):
    __tablename__ = "project_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    actor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(String(128), nullable=False)
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="versions")
    actor = relationship("User", foreign_keys=[actor_user_id])
