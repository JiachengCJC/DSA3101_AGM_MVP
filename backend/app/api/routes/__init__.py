"""Route module exports for the backend API."""

from app.api.routes import auth, projects, analytics, ingest, assistant

__all__ = ["auth", "projects", "analytics", "ingest", "assistant"]
