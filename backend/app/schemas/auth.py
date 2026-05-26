"""Pydantic schemas for authentication, account management, and user directory endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr


class UserCreate(BaseModel):
    """Request payload for creating a new user account."""
    email: EmailStr
    password: str
    full_name: str | None = None
    role: Literal["researcher", "management", "admin"] = "researcher"


class UserOut(BaseModel):
    """Public user profile returned by auth/user endpoints."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str | None
    role: Literal["researcher", "management", "admin"]


class Token(BaseModel):
    """Bearer-token response payload."""
    access_token: str
    token_type: str = "bearer"


class LoginOtpChallengeOut(BaseModel):
    """Serialized OTP challenge metadata shown to the client."""
    challenge_id: str
    masked_email: str
    resend_available_at: str
    expires_at: str
    message: str = "OTP sent to your email"


class LoginResult(BaseModel):
    """Login response that may contain either JWT credentials or OTP challenge details."""
    access_token: str | None = None
    token_type: str = "bearer"
    challenge_id: str | None = None
    masked_email: str | None = None
    resend_available_at: str | None = None
    expires_at: str | None = None
    message: str | None = None


class OtpVerifyIn(BaseModel):
    """Request payload for verifying an OTP challenge."""
    challenge_id: str
    otp: str
    remember_device: bool = False


class OtpResendIn(BaseModel):
    """Request payload for generating a replacement OTP challenge."""
    challenge_id: str


class PasswordChangeRequestIn(BaseModel):
    """Request payload to start the password-change OTP flow."""
    current_password: str
    new_password: str


class PasswordChangeVerifyIn(BaseModel):
    """Request payload to finalize password change using OTP."""
    challenge_id: str
    otp: str


class MessageOut(BaseModel):
    """Simple status message response."""
    message: str


class UserProjectAccessOut(BaseModel):
    """Per-project access details embedded in user profile responses."""
    project_id: int
    title: str
    relationship_type: Literal["owner", "permission"]
    access_level: str
    can_view: bool
    can_edit: bool
    can_add_update: bool
    can_add_funding: bool
    can_manage_access: bool


class UserRecentActivityOut(BaseModel):
    """Recent audit activity row for a user profile."""
    id: int
    action: str
    entity_type: str
    entity_id: int
    diff_json: str | None = None
    created_at: datetime


class UserDetailOut(UserOut):
    """Expanded user profile including projects and recent activity."""
    created_at: datetime
    projects: list[UserProjectAccessOut]
    recent_activity: list[UserRecentActivityOut]
