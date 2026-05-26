"""Assistant chat endpoint and LLM provider adapters grounded on the caller's visible project portfolio."""

import json
from collections import Counter
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.models.access import ProjectPermission
from app.models.project import Project
from app.models.user import User
from app.schemas.assistant import ChatRequest, ChatResponse

router = APIRouter(prefix="/assistant", tags=["assistant"])

MODE_OPENAI = 1
MODE_OLLAMA = 2
MODE_LOCAL = 3


def _format_counter(counter: Counter[str]) -> str:
    """Serialize a `Counter` into a compact, human-readable summary string."""
    if not counter:
        return "None"
    return ", ".join(f"{key}: {value}" for key, value in counter.most_common())


def _serialize_scalar(value: Any) -> Any:
    """Convert DB scalar values to JSON-safe types for assistant context payloads."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _project_to_dict(project: Project) -> dict[str, Any]:
    # Keep this aligned to the real projects table schema by reading SQLAlchemy columns.
    """Serialize one project row using SQLAlchemy column metadata to avoid schema drift."""
    return {
        column.name: _serialize_scalar(getattr(project, column.name))
        for column in Project.__table__.columns
    }


def _build_portfolio_context(db: Session, user: User) -> dict[str, Any]:
    """Collect role-scoped portfolio metrics and raw project rows for assistant grounding."""
    query = db.query(Project)
    if user.role != "admin":
        permission_scope = db.query(ProjectPermission.project_id).filter(
            ProjectPermission.user_id == user.id,
            or_(
                ProjectPermission.can_view.is_(True),
                ProjectPermission.can_edit.is_(True),
                ProjectPermission.can_add_update.is_(True),
                ProjectPermission.can_add_funding.is_(True),
                ProjectPermission.can_manage_access.is_(True),
            ),
        )
        query = query.filter(
            or_(
                Project.owner_id == user.id,
                Project.id.in_(permission_scope),
            )
        )

    projects = query.order_by(Project.updated_at.desc()).all()
    total = len(projects)
    active = sum(1 for p in projects if p.end_date is None)

    by_domain = Counter((p.domain or "Unknown") for p in projects)
    by_lifecycle = Counter((p.lifecycle_stage or "Unknown") for p in projects)
    by_trl = Counter((p.trl_level or "Unknown") for p in projects)
    by_trc = Counter((p.trc_category or "Unknown") for p in projects)
    total_spent = sum(float(p.funding_amount_sgd or 0) for p in projects)

    latest_titles = [p.title for p in projects[:5]]
    project_rows = [_project_to_dict(p) for p in projects]

    return {
        "user_role": user.role,
        "visible_scope": "all_projects" if user.role == "admin" else "project_level_permissions",
        "total": total,
        "active": active,
        "domain": _format_counter(by_domain),
        "lifecycle": _format_counter(by_lifecycle),
        "trl": _format_counter(by_trl),
        "trc": _format_counter(by_trc),
        "total_spent": total_spent,
        "latest_titles": latest_titles,
        "projects": project_rows,
    }


def _fallback_reply(message: str, context: dict[str, Any]) -> str:
    """Generate deterministic local replies when external LLM providers are unavailable."""
    lower = message.lower()
    total = context["total"]
    active = context["active"]
    domain = context["domain"]
    lifecycle = context["lifecycle"]
    trl = context["trl"]
    trc = context["trc"]
    total_spent = context["total_spent"]
    latest_titles = context["latest_titles"]

    if any(k in lower for k in ("domain", "specialty", "type")):
        return (
            f"Category distribution: {domain}. "
            "If you want, I can suggest where to rebalance resources."
        )

    if any(k in lower for k in ("fund", "funding", "spend", "budget")):
        return (
            f"Current total spent amount is SGD {total_spent:,.2f}. "
            "I can break this down by domain or project."
        )

    if any(k in lower for k in ("stage", "maturity", "progress", "trl", "trc", "lifecycle")):
        return (
            f"Lifecycle-stage distribution: {lifecycle}. "
            f"TRL distribution: {trl}. TRC distribution: {trc}."
        )

    if any(k in lower for k in ("summary", "overview", "portfolio", "status")):
        return (
            f"You have {total} total projects, with {active} currently active. "
            f"Category distribution: {domain}. Lifecycle distribution: {lifecycle}. "
            f"Total spent: SGD {total_spent:,.2f}."
        )

    latest = ", ".join(latest_titles) if latest_titles else "no recent projects yet"
    return (
        f"I can help with portfolio insights, domain mix, funding usage, and project planning. "
        f"Current snapshot: {total} projects ({active} active). "
        f"Recent projects: {latest}."
    )


def _build_system_prompt(context: dict[str, Any]) -> str:
    """Construct the system prompt that embeds portfolio metrics and project-table JSON."""
    projects_json = json.dumps(context["projects"], ensure_ascii=True)
    return (
        "You are an AI assistant for an AI project management portal.\n"
        "Be concise and practical.\n"
        f"User role: {context['user_role']}. Visible scope: {context['visible_scope']}.\n"
        f"Portfolio context: total={context['total']}, active={context['active']}, "
        f"domain=({context['domain']}), lifecycle=({context['lifecycle']}), "
        f"trl=({context['trl']}), trc=({context['trc']}), "
        f"total_spent_sgd={context['total_spent']:.2f}.\n"
        "The following JSON contains all visible rows from the projects table. "
        "Use it as source of truth when answering project-specific questions.\n"
        f"projects_table_rows={projects_json}"
    )


def _build_messages(message: str, history: list[dict[str, str]], context: dict[str, Any]) -> list[dict[str, str]]:
    """Assemble system, recent history, and user prompt into chat-completion messages."""
    messages = [{"role": "system", "content": _build_system_prompt(context)}]
    messages.extend(history[-8:])
    messages.append({"role": "user", "content": message})
    return messages


def _normalize_mode(mode: int) -> int:
    """Validate requested provider mode and fall back to OpenAI mode for unknown values."""
    if mode in (MODE_OPENAI, MODE_OLLAMA, MODE_LOCAL):
        return mode
    return MODE_OPENAI


def _extract_openai_content(data: dict[str, Any]) -> str | None:
    """Extract assistant text from an OpenAI-compatible chat-completions response body."""
    content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
    return None


async def _call_openai(messages: list[dict[str, str]]) -> str | None:
    """Call OpenAI Chat Completions and return trimmed assistant content when available."""
    if not settings.OPENAI_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.OPENAI_MODEL,
                    "messages": messages,
                    "temperature": 0.2,
                },
            )
            resp.raise_for_status()
            return _extract_openai_content(resp.json())
    except Exception:
        return None

    return None


async def _call_ollama(messages: list[dict[str, str]]) -> str | None:
    """Call the Ollama chat endpoint and return assistant content when available."""
    base_url = settings.OLLAMA_BASE_URL.rstrip("/")
    endpoint = base_url if base_url.endswith("/api/chat") else f"{base_url}/api/chat"

    try:
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                endpoint,
                json={
                    "model": settings.OLLAMA_MODEL,
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": 0.2},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = (data.get("message") or {}).get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
    except Exception:
        return None

    return None


async def _call_local(messages: list[dict[str, str]]) -> str | None:
    """Call a local OpenAI-compatible chat endpoint and return assistant content."""
    base_url = settings.LOCAL_LLM_BASE_URL.rstrip("/")
    endpoint = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"

    headers = {"Content-Type": "application/json"}
    if settings.LOCAL_LLM_API_KEY:
        headers["Authorization"] = f"Bearer {settings.LOCAL_LLM_API_KEY}"

    try:
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                endpoint,
                headers=headers,
                json={
                    "model": settings.LOCAL_LLM_MODEL,
                    "messages": messages,
                    "temperature": 0.2,
                },
            )
            resp.raise_for_status()
            return _extract_openai_content(resp.json())
    except Exception:
        return None

    return None


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Serve assistant chat requests using the selected provider with automatic fallback."""
    context = _build_portfolio_context(db, user)
    history = [{"role": msg.role, "content": msg.content} for msg in payload.history]
    messages = _build_messages(payload.message, history, context)
    mode = _normalize_mode(payload.mode if payload.mode is not None else settings.LLM_MODE)

    llm_reply: str | None = None
    provider = "fallback"

    if mode == MODE_OPENAI:
        llm_reply = await _call_openai(messages)
        provider = "openai"
    elif mode == MODE_OLLAMA:
        llm_reply = await _call_ollama(messages)
        provider = "ollama"
    elif mode == MODE_LOCAL:
        llm_reply = await _call_local(messages)
        provider = "local"

    if llm_reply:
        return ChatResponse(reply=llm_reply, provider=provider)

    return ChatResponse(reply=_fallback_reply(payload.message, context), provider="fallback")
