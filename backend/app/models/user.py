"""ORM model for user accounts and their project relationships."""

from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    """Represents a portal user and their role within the system."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="researcher", nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    projects = relationship("Project", back_populates="owner")
    trusted_devices = relationship("TrustedDevice", back_populates="user")
