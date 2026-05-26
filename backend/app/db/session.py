"""SQLAlchemy engine and session-factory configuration used across the backend."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

"""
`engine` manages pooled DB connections. `pool_pre_ping=True` verifies stale connections
before use so request handlers do not fail on idle disconnects.
"""
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

"""
`SessionLocal` builds short-lived SQLAlchemy sessions for request handlers and jobs.
Sessions require explicit commits and keep autoflush disabled for predictable write timing.
"""
