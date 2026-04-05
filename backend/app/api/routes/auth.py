from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.core.config import settings
from app.core.email import EmailDeliveryError, send_login_otp_email
from app.core.security import (
    create_access_token,
    generate_device_token,
    generate_numeric_otp,
    hash_device_token,
    hash_otp,
    hash_password,
    verify_otp,
    verify_password,
)
from app.models.access import ProjectPermission, ProjectVersion
from app.models.audit import AuditLog
from app.models.audit import ProjectFundingEvent, ProjectUpdate
from app.models.login_otp import LoginOtpChallenge
from app.models.project import Project
from app.models.trusted_device import TrustedDevice
from app.models.user import User
from app.schemas.auth import LoginOtpChallengeOut, LoginResult, OtpResendIn, OtpVerifyIn, Token, UserCreate, UserOut
from app.schemas.auth import MessageOut, PasswordChangeRequestIn, PasswordChangeVerifyIn
from app.schemas.auth import UserDetailOut, UserProjectAccessOut, UserRecentActivityOut

router = APIRouter(prefix="/auth", tags=["auth"])

OTP_SUPERSEDED = "superseded"
OTP_EMAIL_SEND_FAILED = "email_send_failed"
OTP_TOO_MANY_ATTEMPTS = "too_many_attempts"
OTP_PURPOSE_LOGIN = "login"
OTP_PURPOSE_PASSWORD_CHANGE = "password_change"
OTP_BYPASS_EMAILS = {
    "dsa10ademo+admin@gmail.com",
    "dsa10ademo+management@gmail.com",
    "dsa10ademo+researcher@gmail.com",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _mask_email(email: str) -> str:
    local_part, _, domain = email.partition("@")
    if len(local_part) <= 2:
        masked_local = f"{local_part[:1]}***"
    else:
        masked_local = f"{local_part[:2]}***{local_part[-1:]}"
    return f"{masked_local}@{domain}"


def _serialize_challenge(challenge: LoginOtpChallenge, user: User) -> LoginOtpChallengeOut:
    message = "OTP sent to your email"
    if challenge.purpose == OTP_PURPOSE_PASSWORD_CHANGE:
        message = "OTP sent to your registered email to confirm password change"
    return LoginOtpChallengeOut(
        challenge_id=challenge.id,
        masked_email=_mask_email(user.email),
        resend_available_at=challenge.resend_available_at.isoformat(),
        expires_at=challenge.expires_at.isoformat(),
        message=message,
    )


def _trusted_device_expiry(now: datetime) -> datetime:
    return now + timedelta(hours=settings.TRUSTED_DEVICE_EXPIRE_HOURS)


def _set_trusted_device_cookie(response: Response, token: str, expires_at: datetime) -> None:
    max_age = max(0, int((expires_at - _utcnow()).total_seconds()))
    response.set_cookie(
        key=settings.TRUSTED_DEVICE_COOKIE_NAME,
        value=token,
        max_age=max_age,
        expires=expires_at,
        httponly=True,
        samesite="lax",
        secure=settings.ENV == "prod",
        path="/",
    )


def _clear_trusted_device_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.TRUSTED_DEVICE_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=settings.ENV == "prod",
        path="/",
    )


def _consume_trusted_device_cookie(request: Request) -> str | None:
    token = request.cookies.get(settings.TRUSTED_DEVICE_COOKIE_NAME)
    if not token:
        return None
    return token


def _find_valid_trusted_device(db: Session, user_id: int, token: str, now: datetime) -> TrustedDevice | None:
    token_hash = hash_device_token(token)
    trusted_device = (
        db.query(TrustedDevice)
        .filter(
            TrustedDevice.user_id == user_id,
            TrustedDevice.token_hash == token_hash,
        )
        .first()
    )
    if trusted_device is None:
        return None
    if trusted_device.expires_at <= now:
        db.delete(trusted_device)
        db.commit()
        return None
    return trusted_device


def _issue_trusted_device(db: Session, user: User, now: datetime) -> tuple[TrustedDevice, str]:
    device_token = generate_device_token()
    trusted_device = TrustedDevice(
        user_id=user.id,
        token_hash=hash_device_token(device_token),
        expires_at=_trusted_device_expiry(now),
        last_used_at=now,
    )
    db.add(trusted_device)
    db.flush()
    return trusted_device, device_token


def _revoke_trusted_device_by_token(db: Session, user_id: int, token: str | None) -> bool:
    if not token:
        return False
    trusted_device = (
        db.query(TrustedDevice)
        .filter(
            TrustedDevice.user_id == user_id,
            TrustedDevice.token_hash == hash_device_token(token),
        )
        .first()
    )
    if trusted_device is None:
        return False
    db.delete(trusted_device)
    return True


def _log_audit(db: Session, actor_user_id: int, action: str, entity_type: str, entity_id: int, diff: dict) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            diff_json=AuditLog.dumps(diff),
        )
    )


def _invalidate_active_challenges(
    db: Session,
    user_id: int,
    reason: str,
    now: datetime,
    exclude_id: str | None = None,
) -> None:
    query = db.query(LoginOtpChallenge).filter(
        LoginOtpChallenge.user_id == user_id,
        LoginOtpChallenge.used_at.is_(None),
        LoginOtpChallenge.invalidated_at.is_(None),
    )
    if exclude_id is not None:
        query = query.filter(LoginOtpChallenge.id != exclude_id)

    for challenge in query.all():
        challenge.invalidated_at = now
        challenge.invalidation_reason = reason


def _find_newer_challenge(db: Session, challenge: LoginOtpChallenge) -> LoginOtpChallenge | None:
    return (
        db.query(LoginOtpChallenge)
        .filter(
            LoginOtpChallenge.user_id == challenge.user_id,
            LoginOtpChallenge.generated_at > challenge.generated_at,
        )
        .order_by(LoginOtpChallenge.generated_at.desc())
        .first()
    )


def _create_challenge(
    db: Session,
    user: User,
    now: datetime,
    *,
    purpose: str = OTP_PURPOSE_LOGIN,
    pending_password_hash: str | None = None,
) -> tuple[LoginOtpChallenge, str]:
    otp_code = generate_numeric_otp()
    challenge = LoginOtpChallenge(
        user_id=user.id,
        purpose=purpose,
        hashed_otp=hash_otp(otp_code),
        pending_password_hash=pending_password_hash,
        expires_at=now + timedelta(minutes=settings.MFA_OTP_EXPIRE_MINUTES),
        generated_at=now,
        resend_available_at=now + timedelta(seconds=settings.MFA_RESEND_COOLDOWN_SECONDS),
        failed_attempts=0,
    )
    db.add(challenge)
    db.flush()
    return challenge, otp_code


def _send_challenge_email(db: Session, challenge: LoginOtpChallenge, user: User, otp_code: str, now: datetime) -> None:
    try:
        send_login_otp_email(user.email, otp_code, user.full_name)
    except EmailDeliveryError as exc:
        challenge.invalidated_at = now
        challenge.invalidation_reason = OTP_EMAIL_SEND_FAILED
        action = "LOGIN_OTP_SEND_FAILED"
        if challenge.purpose == OTP_PURPOSE_PASSWORD_CHANGE:
            action = "PASSWORD_CHANGE_OTP_SEND_FAILED"
        _log_audit(
            db,
            actor_user_id=user.id,
            action=action,
            entity_type="User",
            entity_id=user.id,
            diff={"email": user.email, "challenge_id": challenge.id},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to send OTP email. Generate a new OTP and try again.",
        ) from exc


def _load_challenge_or_404(db: Session, challenge_id: str) -> LoginOtpChallenge:
    challenge = db.query(LoginOtpChallenge).filter(LoginOtpChallenge.id == challenge_id).first()
    if challenge is None:
        raise HTTPException(status_code=404, detail="OTP challenge not found.")
    return challenge


def _ensure_challenge_user(challenge: LoginOtpChallenge, user: User) -> None:
    if challenge.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed")


def _ensure_resend_allowed(db: Session, challenge: LoginOtpChallenge, now: datetime) -> None:
    if challenge.used_at is not None:
        raise HTTPException(status_code=400, detail="OTP already used. Generate a new OTP.")
    if challenge.invalidated_at is not None and challenge.invalidation_reason == OTP_SUPERSEDED:
        raise HTTPException(status_code=400, detail="A newer code was requested")
    if challenge.resend_available_at > now:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Generate new OTP after one minute",
        )


def _validate_submitted_challenge_state(db: Session, challenge: LoginOtpChallenge, now: datetime) -> None:
    if challenge.used_at is not None:
        raise HTTPException(status_code=400, detail="OTP already used. Generate a new OTP.")
    if challenge.invalidated_at is not None:
        if challenge.invalidation_reason == OTP_SUPERSEDED or _find_newer_challenge(db, challenge):
            raise HTTPException(status_code=400, detail="A newer code was requested")
        if challenge.invalidation_reason == OTP_TOO_MANY_ATTEMPTS:
            raise HTTPException(
                status_code=400,
                detail="5 wrong attempts reached. Generate new OTP after one minute",
            )
        if challenge.invalidation_reason == OTP_EMAIL_SEND_FAILED:
            raise HTTPException(status_code=400, detail="Unable to send OTP email. Generate a new OTP and try again.")
        raise HTTPException(status_code=400, detail="OTP invalidated. Generate a new OTP.")
    if challenge.expires_at < now:
        raise HTTPException(status_code=400, detail="OTP expired. Generate a new OTP.")


@router.post("/register", response_model=UserOut)
def register(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _user=Depends(require_role("admin")),
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _log_audit(
        db,
        actor_user_id=_user.id,
        action="CREATE_USER",
        entity_type="User",
        entity_id=user.id,
        diff={"email": user.email, "role": user.role},
    )
    db.commit()
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _user=Depends(require_role("admin")),
):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.get("/users/{user_id}", response_model=UserDetailOut)
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    _user=Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    project_rows: list[UserProjectAccessOut] = []
    seen_project_ids: set[int] = set()

    owned_projects = (
        db.query(Project)
        .filter(Project.owner_id == user.id)
        .order_by(Project.title.asc())
        .all()
    )
    for project in owned_projects:
        project_rows.append(
            UserProjectAccessOut(
                project_id=project.id,
                title=project.title,
                relationship_type="owner",
                access_level="owner",
                can_view=True,
                can_edit=True,
                can_add_update=True,
                can_add_funding=True,
                can_manage_access=True,
            )
        )
        seen_project_ids.add(project.id)

    permission_rows = (
        db.query(ProjectPermission, Project)
        .join(Project, Project.id == ProjectPermission.project_id)
        .filter(ProjectPermission.user_id == user.id)
        .order_by(Project.title.asc())
        .all()
    )
    for permission, project in permission_rows:
        if project.id in seen_project_ids:
            continue
        project_rows.append(
            UserProjectAccessOut(
                project_id=project.id,
                title=project.title,
                relationship_type="permission",
                access_level=permission.access_level_key,
                can_view=bool(permission.can_view),
                can_edit=bool(permission.can_edit),
                can_add_update=bool(permission.can_add_update),
                can_add_funding=bool(permission.can_add_funding),
                can_manage_access=bool(permission.can_manage_access),
            )
        )

    recent_activity_rows = (
        db.query(AuditLog)
        .filter(AuditLog.actor_user_id == user.id)
        .order_by(AuditLog.created_at.desc())
        .limit(5)
        .all()
    )
    recent_activity = [
        UserRecentActivityOut(
            id=row.id,
            action=row.action,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            diff_json=row.diff_json,
            created_at=row.created_at,
        )
        for row in recent_activity_rows
    ]

    return UserDetailOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        created_at=user.created_at,
        projects=project_rows,
        recent_activity=recent_activity,
    )


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user=Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if user.role == "admin":
        remaining_admins = db.query(User).filter(User.role == "admin", User.id != user.id).count()
        if remaining_admins == 0:
            raise HTTPException(status_code=400, detail="At least one admin account must remain")
    owned_projects = db.query(Project).filter(Project.owner_id == user.id).count()
    if owned_projects > 0:
        raise HTTPException(status_code=400, detail="Cannot delete a user who still owns projects")

    db.query(TrustedDevice).filter(TrustedDevice.user_id == user.id).delete(synchronize_session=False)
    db.query(ProjectPermission).filter(ProjectPermission.user_id == user.id).delete(synchronize_session=False)
    db.query(ProjectPermission).filter(ProjectPermission.granted_by_user_id == user.id).update(
        {ProjectPermission.granted_by_user_id: admin_user.id},
        synchronize_session=False,
    )
    db.query(ProjectUpdate).filter(ProjectUpdate.author_user_id == user.id).update(
        {ProjectUpdate.author_user_id: admin_user.id},
        synchronize_session=False,
    )
    db.query(ProjectFundingEvent).filter(ProjectFundingEvent.author_user_id == user.id).update(
        {ProjectFundingEvent.author_user_id: admin_user.id},
        synchronize_session=False,
    )
    db.query(ProjectVersion).filter(ProjectVersion.actor_user_id == user.id).update(
        {ProjectVersion.actor_user_id: admin_user.id},
        synchronize_session=False,
    )
    db.query(AuditLog).filter(AuditLog.actor_user_id == user.id).update(
        {AuditLog.actor_user_id: admin_user.id},
        synchronize_session=False,
    )

    db.delete(user)
    _log_audit(
        db,
        actor_user_id=admin_user.id,
        action="DELETE_USER",
        entity_type="User",
        entity_id=user_id,
        diff={"email": user.email, "role": user.role},
    )
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user=Depends(get_current_user)):
    return user


@router.post("/token", response_model=LoginResult)
def login(
    request: Request,
    response: Response,
    remember_device: bool = Form(False),
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        if user:
            _log_audit(
                db,
                actor_user_id=user.id,
                action="LOGIN_FAILED",
                entity_type="User",
                entity_id=user.id,
                diff={"email": user.email},
            )
        db.commit()
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    now = _utcnow()
    trusted_device_token = _consume_trusted_device_cookie(request)
    trusted_device = None
    if trusted_device_token:
        trusted_device = _find_valid_trusted_device(db, user.id, trusted_device_token, now)
        if trusted_device is None:
            _clear_trusted_device_cookie(response)

    if user.email in OTP_BYPASS_EMAILS:
        _log_audit(
            db,
            actor_user_id=user.id,
            action="LOGIN",
            entity_type="User",
            entity_id=user.id,
            diff={"email": user.email, "otp_bypassed": True, "remember_device": remember_device},
        )
        db.commit()
        token = create_access_token(subject=user.email, role=user.role)
        return LoginResult(access_token=token, message="OTP bypassed for demo account")

    if trusted_device is not None:
        trusted_device.last_used_at = now
        _log_audit(
            db,
            actor_user_id=user.id,
            action="LOGIN",
            entity_type="User",
            entity_id=user.id,
            diff={"email": user.email, "trusted_device": True},
        )
        db.commit()
        token = create_access_token(subject=user.email, role=user.role)
        return LoginResult(access_token=token, message="Trusted device recognized")

    _invalidate_active_challenges(db, user.id, OTP_SUPERSEDED, now)
    challenge, otp_code = _create_challenge(db, user, now, purpose=OTP_PURPOSE_LOGIN)
    _send_challenge_email(db, challenge, user, otp_code, now)
    _log_audit(
        db,
        actor_user_id=user.id,
        action="LOGIN_OTP_SENT",
        entity_type="User",
        entity_id=user.id,
        diff={"email": user.email, "challenge_id": challenge.id},
    )
    db.commit()
    db.refresh(challenge)
    serialized = _serialize_challenge(challenge, user)
    return LoginResult(
        challenge_id=serialized.challenge_id,
        masked_email=serialized.masked_email,
        resend_available_at=serialized.resend_available_at,
        expires_at=serialized.expires_at,
        message=serialized.message,
    )


@router.post("/otp/resend", response_model=LoginOtpChallengeOut)
def resend_otp(payload: OtpResendIn, db: Session = Depends(get_db)):
    challenge = _load_challenge_or_404(db, payload.challenge_id)
    if challenge.purpose != OTP_PURPOSE_LOGIN:
        raise HTTPException(status_code=400, detail="Use the password change resend flow for this OTP.")
    now = _utcnow()
    _ensure_resend_allowed(db, challenge, now)

    user = db.query(User).filter(User.id == challenge.user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if challenge.invalidated_at is None:
        challenge.invalidated_at = now
        challenge.invalidation_reason = OTP_SUPERSEDED

    _invalidate_active_challenges(db, user.id, OTP_SUPERSEDED, now, exclude_id=challenge.id)
    new_challenge, otp_code = _create_challenge(
        db,
        user,
        now,
        purpose=challenge.purpose,
        pending_password_hash=challenge.pending_password_hash,
    )
    _send_challenge_email(db, new_challenge, user, otp_code, now)
    _log_audit(
        db,
        actor_user_id=user.id,
        action="LOGIN_OTP_RESENT",
        entity_type="User",
        entity_id=user.id,
        diff={"email": user.email, "challenge_id": new_challenge.id, "previous_challenge_id": challenge.id},
    )
    db.commit()
    db.refresh(new_challenge)
    return _serialize_challenge(new_challenge, user)


@router.post("/otp/verify", response_model=Token)
def verify_login_otp(payload: OtpVerifyIn, request: Request, response: Response, db: Session = Depends(get_db)):
    challenge = _load_challenge_or_404(db, payload.challenge_id)
    if challenge.purpose != OTP_PURPOSE_LOGIN:
        raise HTTPException(status_code=400, detail="Use the password change verification flow for this OTP.")
    now = _utcnow()
    _validate_submitted_challenge_state(db, challenge, now)

    user = db.query(User).filter(User.id == challenge.user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_otp(payload.otp, challenge.hashed_otp):
        challenge.failed_attempts += 1
        if challenge.failed_attempts >= settings.MFA_MAX_ATTEMPTS:
            challenge.invalidated_at = now
            challenge.invalidation_reason = OTP_TOO_MANY_ATTEMPTS
            _log_audit(
                db,
                actor_user_id=user.id,
                action="LOGIN_OTP_LOCKED",
                entity_type="User",
                entity_id=user.id,
                diff={"email": user.email, "challenge_id": challenge.id},
            )
            db.commit()
            raise HTTPException(
                status_code=400,
                detail="5 wrong attempts reached. Generate new OTP after one minute",
            )

        _log_audit(
            db,
            actor_user_id=user.id,
            action="LOGIN_OTP_FAILED",
            entity_type="User",
            entity_id=user.id,
            diff={"email": user.email, "challenge_id": challenge.id, "failed_attempts": challenge.failed_attempts},
        )
        db.commit()
        raise HTTPException(status_code=400, detail="Wrong OTP")

    challenge.used_at = now
    _invalidate_active_challenges(db, user.id, OTP_SUPERSEDED, now, exclude_id=challenge.id)
    _log_audit(
        db,
        actor_user_id=user.id,
        action="LOGIN",
        entity_type="User",
        entity_id=user.id,
        diff={"email": user.email, "challenge_id": challenge.id, "remember_device": payload.remember_device},
    )
    if payload.remember_device:
        _, device_token = _issue_trusted_device(db, user, now)
    else:
        _revoke_trusted_device_by_token(db, user.id, _consume_trusted_device_cookie(request))
        device_token = None
    db.commit()

    token = create_access_token(subject=user.email, role=user.role)
    if payload.remember_device and device_token:
        _set_trusted_device_cookie(response, device_token, _trusted_device_expiry(now))
    else:
        _clear_trusted_device_cookie(response)
    return Token(access_token=token)


@router.post("/logout", response_model=MessageOut)
def logout(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _log_audit(
        db,
        actor_user_id=user.id,
        action="LOGOUT",
        entity_type="User",
        entity_id=user.id,
        diff={"email": user.email},
    )
    db.commit()
    return MessageOut(message="Logged out successfully.")


@router.post("/password/change/request", response_model=LoginOtpChallengeOut)
def request_password_change(
    payload: PasswordChangeRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    current_password = payload.current_password
    new_password = payload.new_password

    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if not new_password.strip():
        raise HTTPException(status_code=400, detail="New password cannot be empty.")
    if verify_password(new_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different from your current password.")

    pending_password_hash = hash_password(new_password)
    now = _utcnow()
    _invalidate_active_challenges(db, user.id, OTP_SUPERSEDED, now)
    challenge, otp_code = _create_challenge(
        db,
        user,
        now,
        purpose=OTP_PURPOSE_PASSWORD_CHANGE,
        pending_password_hash=pending_password_hash,
    )
    _send_challenge_email(db, challenge, user, otp_code, now)
    _log_audit(
        db,
        actor_user_id=user.id,
        action="PASSWORD_CHANGE_OTP_SENT",
        entity_type="User",
        entity_id=user.id,
        diff={"email": user.email, "challenge_id": challenge.id},
    )
    db.commit()
    db.refresh(challenge)
    return _serialize_challenge(challenge, user)


@router.post("/password/change/resend", response_model=LoginOtpChallengeOut)
def resend_password_change_otp(
    payload: OtpResendIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    challenge = _load_challenge_or_404(db, payload.challenge_id)
    _ensure_challenge_user(challenge, user)
    if challenge.purpose != OTP_PURPOSE_PASSWORD_CHANGE:
        raise HTTPException(status_code=400, detail="This OTP is not for password change.")

    now = _utcnow()
    _ensure_resend_allowed(db, challenge, now)

    if challenge.invalidated_at is None:
        challenge.invalidated_at = now
        challenge.invalidation_reason = OTP_SUPERSEDED

    _invalidate_active_challenges(db, user.id, OTP_SUPERSEDED, now, exclude_id=challenge.id)
    new_challenge, otp_code = _create_challenge(
        db,
        user,
        now,
        purpose=challenge.purpose,
        pending_password_hash=challenge.pending_password_hash,
    )
    _send_challenge_email(db, new_challenge, user, otp_code, now)
    _log_audit(
        db,
        actor_user_id=user.id,
        action="PASSWORD_CHANGE_OTP_RESENT",
        entity_type="User",
        entity_id=user.id,
        diff={"email": user.email, "challenge_id": new_challenge.id, "previous_challenge_id": challenge.id},
    )
    db.commit()
    db.refresh(new_challenge)
    return _serialize_challenge(new_challenge, user)


@router.post("/password/change/verify", response_model=MessageOut)
def verify_password_change(
    payload: PasswordChangeVerifyIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    challenge = _load_challenge_or_404(db, payload.challenge_id)
    _ensure_challenge_user(challenge, user)
    if challenge.purpose != OTP_PURPOSE_PASSWORD_CHANGE:
        raise HTTPException(status_code=400, detail="This OTP is not for password change.")
    if not challenge.pending_password_hash:
        raise HTTPException(status_code=400, detail="Password change request is incomplete. Start again.")

    now = _utcnow()
    _validate_submitted_challenge_state(db, challenge, now)

    if not verify_otp(payload.otp, challenge.hashed_otp):
        challenge.failed_attempts += 1
        if challenge.failed_attempts >= settings.MFA_MAX_ATTEMPTS:
            challenge.invalidated_at = now
            challenge.invalidation_reason = OTP_TOO_MANY_ATTEMPTS
            _log_audit(
                db,
                actor_user_id=user.id,
                action="PASSWORD_CHANGE_OTP_LOCKED",
                entity_type="User",
                entity_id=user.id,
                diff={"email": user.email, "challenge_id": challenge.id},
            )
            db.commit()
            raise HTTPException(
                status_code=400,
                detail="5 wrong attempts reached. Generate new OTP after one minute",
            )

        _log_audit(
            db,
            actor_user_id=user.id,
            action="PASSWORD_CHANGE_OTP_FAILED",
            entity_type="User",
            entity_id=user.id,
            diff={"email": user.email, "challenge_id": challenge.id, "failed_attempts": challenge.failed_attempts},
        )
        db.commit()
        raise HTTPException(status_code=400, detail="Wrong OTP")

    challenge.used_at = now
    user.hashed_password = challenge.pending_password_hash
    challenge.pending_password_hash = None
    _invalidate_active_challenges(db, user.id, OTP_SUPERSEDED, now, exclude_id=challenge.id)
    _log_audit(
        db,
        actor_user_id=user.id,
        action="PASSWORD_CHANGE_COMPLETED",
        entity_type="User",
        entity_id=user.id,
        diff={"email": user.email, "challenge_id": challenge.id},
    )
    db.add(user)
    db.commit()
    return MessageOut(message="Password updated successfully.")
