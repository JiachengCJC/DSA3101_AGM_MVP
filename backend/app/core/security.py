"""Security primitives for password hashing, OTP handling, trusted-device tokens, and JWT creation."""

from datetime import datetime, timedelta
import hashlib
import secrets
from typing import Any, Optional

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a user password with bcrypt via Passlib context."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_otp(otp: str) -> str:
    """Hash an OTP value before storing it in the database."""
    return pwd_context.hash(otp)


def verify_otp(plain_otp: str, hashed_otp: str) -> bool:
    """Verify a submitted OTP against its stored hash."""
    return pwd_context.verify(plain_otp, hashed_otp)


def generate_numeric_otp(length: int = 6) -> str:
    """Generate a fixed-length numeric OTP string using cryptographically secure randomness."""
    upper_bound = 10**length
    return f"{secrets.randbelow(upper_bound):0{length}d}"


def generate_device_token() -> str:
    """Generate a random token used for trusted-device cookies."""
    return secrets.token_urlsafe(32)


def hash_device_token(token: str) -> str:
    """Hash trusted-device tokens with a secret-key salt before persistence."""
    return hashlib.sha256(f"{settings.SECRET_KEY}:{token}".encode("utf-8")).hexdigest()


def create_access_token(subject: str, role: str, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token containing subject, role, and expiry claims."""
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.utcnow() + expires_delta
    to_encode: dict[str, Any] = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
