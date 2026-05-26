"""Pydantic request/response schemas for assistant chat."""

from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """Single message in assistant conversation history."""
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    """Incoming assistant query with bounded history and provider mode override."""
    message: str = Field(min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    mode: int | None = Field(default=None, ge=1, le=3)


class ChatResponse(BaseModel):
    """Assistant reply payload with provider attribution."""
    reply: str
    provider: Literal["openai", "ollama", "local", "fallback"] = "fallback"
