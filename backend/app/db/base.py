"""Declarative SQLAlchemy base class shared by all ORM models."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base declarative class used by SQLAlchemy ORM model definitions."""
    pass
