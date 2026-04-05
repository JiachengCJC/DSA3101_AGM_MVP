from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    mode: int | None = Field(default=None, ge=1, le=3)


class ChatResponse(BaseModel):
    reply: str
    provider: Literal["openai", "ollama", "local", "fallback"] = "fallback"
