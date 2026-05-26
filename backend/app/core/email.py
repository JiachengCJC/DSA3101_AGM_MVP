"""Email-delivery helpers used by authentication flows."""

import httpx

from app.core.config import settings


class EmailDeliveryError(Exception):
    """Raised when OTP email delivery fails or cannot be completed."""
    pass


def send_login_otp_email(to_email: str, otp_code: str, full_name: str | None = None) -> None:
    """Send the login/password-change OTP email via Resend and raise `EmailDeliveryError` on failure."""
    if not settings.RESEND_API_KEY:
        raise EmailDeliveryError("RESEND_API_KEY is not configured")

    greeting_name = full_name.strip() if full_name else "there"
    payload = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": "Your AGM Portal verification code",
        "text": (
            f"Hello {greeting_name},\n\n"
            f"Your AGM Portal verification code is {otp_code}.\n"
            f"It expires in {settings.MFA_OTP_EXPIRE_MINUTES} minutes.\n\n"
            "If you did not request this code, you can ignore this email."
        ),
    }
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(settings.RESEND_API_URL, json=payload, headers=headers, timeout=15.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise EmailDeliveryError("OTP email delivery failed") from exc
