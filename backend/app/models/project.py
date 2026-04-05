from sqlalchemy import (
    String,
    Integer,
    Date,
    DateTime,
    Text,
    ForeignKey,
    Numeric,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.db.base import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    institution: Mapped[str] = mapped_column(String(128), nullable=False)
    domain: Mapped[str] = mapped_column(String(128), nullable=False)  # e.g., Radiology, Finance

    ai_type: Mapped[str] = mapped_column(String(128), nullable=False)  # e.g., CV, NLP, tabular
    lifecycle_stage: Mapped[str] = mapped_column(String(128), nullable=False, default="Research & ideation")
    trl_level: Mapped[str] = mapped_column(String(128), nullable=False, default="TRL 1 - basic concept")
    trc_category: Mapped[str] = mapped_column(String(64), nullable=False, default="Research")

    # Funding / timeline
    funding_amount_sgd: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    funds_received: Mapped[str | None] = mapped_column(Text, nullable=True)
    funding_scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    grant_year_obtained: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grant_start_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    grant_end_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    start_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    @validates("grant_end_date")
    def validate_grant_end(self, key, value):
        if self.grant_start_date and value and value < self.grant_start_date:
            raise ValueError("grant_end_date cannot be before grant_start_date")
        return value

    # Collaboration (optional)
    collaboration_formal_signed: Mapped[str | None] = mapped_column(Text, nullable=True)
    collaboration_formal_partner: Mapped[str | None] = mapped_column(String(255), nullable=True)
    collaboration_formal_scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    collaboration_informal_partner: Mapped[str | None] = mapped_column(String(255), nullable=True)
    collaboration_informal_scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    patent_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    publication: Mapped[str | None] = mapped_column(Text, nullable=True)
    possible_synergy: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_office_involvement: Mapped[str | None] = mapped_column(Text, nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    owner = relationship("User", back_populates="projects")

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    updates = relationship("ProjectUpdate", back_populates="project", cascade="all, delete-orphan")
    funding_events = relationship("ProjectFundingEvent", back_populates="project", cascade="all, delete-orphan")
    permissions = relationship("ProjectPermission", back_populates="project", cascade="all, delete-orphan")
    versions = relationship("ProjectVersion", back_populates="project", cascade="all, delete-orphan")
