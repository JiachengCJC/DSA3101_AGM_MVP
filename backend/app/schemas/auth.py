from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    role: Literal["researcher", "management", "admin"] = "researcher"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str | None
    role: Literal["researcher", "management", "admin"]


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginOtpChallengeOut(BaseModel):
    challenge_id: str
    masked_email: str
    resend_available_at: str
    expires_at: str
    message: str = "OTP sent to your email"


class LoginResult(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    challenge_id: str | None = None
    masked_email: str | None = None
    resend_available_at: str | None = None
    expires_at: str | None = None
    message: str | None = None


class OtpVerifyIn(BaseModel):
    challenge_id: str
    otp: str
    remember_device: bool = False


class OtpResendIn(BaseModel):
    challenge_id: str


class PasswordChangeRequestIn(BaseModel):
    current_password: str
    new_password: str


class PasswordChangeVerifyIn(BaseModel):
    challenge_id: str
    otp: str


class MessageOut(BaseModel):
    message: str


class UserProjectAccessOut(BaseModel):
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
    id: int
    action: str
    entity_type: str
    entity_id: int
    diff_json: str | None = None
    created_at: datetime


class UserDetailOut(UserOut):
    created_at: datetime
    projects: list[UserProjectAccessOut]
    recent_activity: list[UserRecentActivityOut]
