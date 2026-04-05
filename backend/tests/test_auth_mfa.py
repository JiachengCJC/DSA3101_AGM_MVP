from datetime import datetime, timedelta
from pathlib import Path
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.deps import get_db
from app.api.routes import auth as auth_routes
from app.core.config import settings
from app.core.email import EmailDeliveryError
from app.core.security import hash_password
from app.db.base import Base
from app.models.login_otp import LoginOtpChallenge
from app.models.trusted_device import TrustedDevice
from app.models.user import User


@pytest.fixture()
def auth_client(tmp_path, monkeypatch):
    db_path = tmp_path / "test_auth_mfa.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    app = FastAPI()
    app.include_router(auth_routes.router, prefix=settings.API_V1_PREFIX)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestingSessionLocal() as db:
        db.add(
            User(
                email="user@example.com",
                full_name="Test User",
                role="researcher",
                hashed_password=hash_password("password"),
            )
        )
        db.commit()

    state = {"sent_codes": []}

    def fake_send_login_otp_email(to_email: str, otp_code: str, full_name: str | None = None):
        state["sent_codes"].append({"email": to_email, "otp": otp_code, "full_name": full_name})

    monkeypatch.setattr(auth_routes, "send_login_otp_email", fake_send_login_otp_email)

    client = TestClient(app)
    yield client, TestingSessionLocal, state
    client.close()
    engine.dispose()


def _create_challenge(client: TestClient, state: dict, email: str = "user@example.com", password: str = "password") -> dict:
    response = client.post(
        f"{settings.API_V1_PREFIX}/auth/token",
        data={"username": email, "password": password},
    )
    assert response.status_code == 200
    assert "access_token" not in response.json()
    assert state["sent_codes"]
    return response.json()


def _load_challenge(SessionLocal, challenge_id: str) -> LoginOtpChallenge:
    with SessionLocal() as db:
        return db.query(LoginOtpChallenge).filter(LoginOtpChallenge.id == challenge_id).first()


def test_password_login_returns_otp_challenge_without_jwt(auth_client):
    client, SessionLocal, state = auth_client

    payload = _create_challenge(client, state)

    challenge = _load_challenge(SessionLocal, payload["challenge_id"])
    assert challenge is not None
    assert challenge.used_at is None
    assert challenge.invalidated_at is None


def test_new_password_login_invalidates_previous_active_challenge(auth_client):
    client, SessionLocal, state = auth_client

    first = _create_challenge(client, state)
    second = _create_challenge(client, state)

    first_challenge = _load_challenge(SessionLocal, first["challenge_id"])
    second_challenge = _load_challenge(SessionLocal, second["challenge_id"])

    assert first_challenge.invalidated_at is not None
    assert first_challenge.invalidation_reason == auth_routes.OTP_SUPERSEDED
    assert second_challenge.invalidated_at is None


def test_verify_exact_challenge_marks_used_and_returns_jwt(auth_client):
    client, SessionLocal, state = auth_client

    challenge_payload = _create_challenge(client, state)
    otp = state["sent_codes"][-1]["otp"]

    response = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/verify",
        json={"challenge_id": challenge_payload["challenge_id"], "otp": otp},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]
    challenge = _load_challenge(SessionLocal, challenge_payload["challenge_id"])
    assert challenge.used_at is not None


def test_used_otp_cannot_be_reused(auth_client):
    client, SessionLocal, state = auth_client

    challenge_payload = _create_challenge(client, state)
    otp = state["sent_codes"][-1]["otp"]
    first = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/verify",
        json={"challenge_id": challenge_payload["challenge_id"], "otp": otp},
    )
    assert first.status_code == 200

    second = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/verify",
        json={"challenge_id": challenge_payload["challenge_id"], "otp": otp},
    )

    assert second.status_code == 400
    assert second.json()["detail"] == "OTP already used. Generate a new OTP."


def test_wrong_otp_increments_attempts_and_locks_on_fifth_failure(auth_client):
    client, SessionLocal, state = auth_client

    challenge_payload = _create_challenge(client, state)
    challenge_id = challenge_payload["challenge_id"]

    for attempt in range(1, settings.MFA_MAX_ATTEMPTS):
        response = client.post(
            f"{settings.API_V1_PREFIX}/auth/otp/verify",
            json={"challenge_id": challenge_id, "otp": "111111"},
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Wrong OTP"
        challenge = _load_challenge(SessionLocal, challenge_id)
        assert challenge.failed_attempts == attempt
        assert challenge.invalidated_at is None

    response = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/verify",
        json={"challenge_id": challenge_id, "otp": "111111"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "5 wrong attempts reached. Generate new OTP after one minute"

    challenge = _load_challenge(SessionLocal, challenge_id)
    assert challenge.failed_attempts == settings.MFA_MAX_ATTEMPTS
    assert challenge.invalidation_reason == auth_routes.OTP_TOO_MANY_ATTEMPTS


def test_remembered_device_skips_otp_for_one_hour(auth_client):
    client, _, state = auth_client

    challenge_payload = client.post(
        f"{settings.API_V1_PREFIX}/auth/token",
        data={"username": "user@example.com", "password": "password", "remember_device": "true"},
    ).json()
    otp = state["sent_codes"][-1]["otp"]

    verify_response = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/verify",
        json={"challenge_id": challenge_payload["challenge_id"], "otp": otp, "remember_device": True},
    )

    assert verify_response.status_code == 200
    assert client.cookies.get(settings.TRUSTED_DEVICE_COOKIE_NAME)
    sent_count = len(state["sent_codes"])

    second_login = client.post(
        f"{settings.API_V1_PREFIX}/auth/token",
        data={"username": "user@example.com", "password": "password"},
    )

    assert second_login.status_code == 200
    assert second_login.json()["access_token"]
    assert second_login.json()["message"] == "Trusted device recognized"
    assert len(state["sent_codes"]) == sent_count


def test_expired_remembered_device_requires_otp_again(auth_client):
    client, SessionLocal, state = auth_client

    challenge_payload = client.post(
        f"{settings.API_V1_PREFIX}/auth/token",
        data={"username": "user@example.com", "password": "password", "remember_device": "true"},
    ).json()
    otp = state["sent_codes"][-1]["otp"]
    verify_response = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/verify",
        json={"challenge_id": challenge_payload["challenge_id"], "otp": otp, "remember_device": True},
    )
    assert verify_response.status_code == 200

    with SessionLocal() as db:
        trusted_device = db.query(TrustedDevice).first()
        trusted_device.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()

    sent_count = len(state["sent_codes"])
    second_login = client.post(
        f"{settings.API_V1_PREFIX}/auth/token",
        data={"username": "user@example.com", "password": "password", "remember_device": "true"},
    )

    assert second_login.status_code == 200
    assert second_login.json()["challenge_id"]
    assert len(state["sent_codes"]) == sent_count + 1


def test_logout_keeps_remembered_device(auth_client):
    client, SessionLocal, state = auth_client

    challenge_payload = client.post(
        f"{settings.API_V1_PREFIX}/auth/token",
        data={"username": "user@example.com", "password": "password", "remember_device": "true"},
    ).json()
    otp = state["sent_codes"][-1]["otp"]
    verify_response = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/verify",
        json={"challenge_id": challenge_payload["challenge_id"], "otp": otp, "remember_device": True},
    )
    token = verify_response.json()["access_token"]

    logout_response = client.post(
        f"{settings.API_V1_PREFIX}/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert logout_response.status_code == 200
    assert client.cookies.get(settings.TRUSTED_DEVICE_COOKIE_NAME)
    with SessionLocal() as db:
        assert db.query(TrustedDevice).count() == 1

    second_login = client.post(
        f"{settings.API_V1_PREFIX}/auth/token",
        data={"username": "user@example.com", "password": "password"},
    )

    assert second_login.status_code == 200
    assert second_login.json()["access_token"]
    assert second_login.json()["message"] == "Trusted device recognized"


def test_expired_otp_returns_expected_message(auth_client):
    client, SessionLocal, state = auth_client

    challenge_payload = _create_challenge(client, state)
    with SessionLocal() as db:
        challenge = db.query(LoginOtpChallenge).filter(LoginOtpChallenge.id == challenge_payload["challenge_id"]).first()
        challenge.expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.commit()

    response = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/verify",
        json={"challenge_id": challenge_payload["challenge_id"], "otp": state["sent_codes"][-1]["otp"]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "OTP expired. Generate a new OTP."


def test_resend_before_cooldown_is_blocked(auth_client):
    client, _, state = auth_client

    challenge_payload = _create_challenge(client, state)
    response = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/resend",
        json={"challenge_id": challenge_payload["challenge_id"]},
    )

    assert response.status_code == 429
    assert response.json()["detail"] == "Generate new OTP after one minute"


def test_resend_creates_new_challenge_and_old_one_reports_newer_code(auth_client):
    client, SessionLocal, state = auth_client

    first = _create_challenge(client, state)
    with SessionLocal() as db:
        challenge = db.query(LoginOtpChallenge).filter(LoginOtpChallenge.id == first["challenge_id"]).first()
        challenge.resend_available_at = datetime.utcnow() - timedelta(seconds=1)
        db.commit()

    resend = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/resend",
        json={"challenge_id": first["challenge_id"]},
    )
    assert resend.status_code == 200
    second = resend.json()
    assert second["challenge_id"] != first["challenge_id"]

    verify_old = client.post(
        f"{settings.API_V1_PREFIX}/auth/otp/verify",
        json={"challenge_id": first["challenge_id"], "otp": state["sent_codes"][0]["otp"]},
    )
    assert verify_old.status_code == 400
    assert verify_old.json()["detail"] == "A newer code was requested"


def test_email_send_failure_invalidates_created_challenge(auth_client, monkeypatch):
    client, SessionLocal, _ = auth_client

    def failing_send_login_otp_email(*args, **kwargs):
        raise EmailDeliveryError("boom")

    monkeypatch.setattr(auth_routes, "send_login_otp_email", failing_send_login_otp_email)

    response = client.post(
        f"{settings.API_V1_PREFIX}/auth/token",
        data={"username": "user@example.com", "password": "password"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "Unable to send OTP email. Generate a new OTP and try again."
    with SessionLocal() as db:
        challenge = db.query(LoginOtpChallenge).order_by(LoginOtpChallenge.generated_at.desc()).first()
        assert challenge is not None
        assert challenge.invalidated_at is not None
        assert challenge.invalidation_reason == auth_routes.OTP_EMAIL_SEND_FAILED


def test_seed_demo_emails_match_expected_values(tmp_path):
    db_path = tmp_path / "seed_demo.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    import app.main as main_module

    original_session_local = main_module.SessionLocal
    main_module.SessionLocal = SessionLocal
    try:
        main_module._seed_users()
        with SessionLocal() as db:
            emails = {email for (email,) in db.query(User.email).all()}
        assert emails == {
            "dsa10ademo+admin@gmail.com",
            "dsa10ademo+management@gmail.com",
            "dsa10ademo+researcher@gmail.com",
        }
    finally:
        main_module.SessionLocal = original_session_local
        engine.dispose()
