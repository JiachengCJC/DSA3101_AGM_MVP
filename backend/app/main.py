from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models.audit import AuditLog
from app.models.user import User
from app.api.routes import auth, projects, analytics, ingest, assistant

# If the table is empty, it automatically creates three "Demo" users.
def _seed_users() -> None:
    """Seed demo users if DB is empty (MVP only)."""
    # It is a temporary, secure "bridge" that allows your Python code to translate and send data to your database 
    # and then safely disconnect so the system stays fast and organized.
    db: Session = SessionLocal()
    try:
        existing_emails = {email for (email,) in db.query(User.email).all()}
        changed = False
        legacy_demo_map = {
            "admin@example.com": "dsa10ademo+admin@gmail.com",
            "management@example.com": "dsa10ademo+management@gmail.com",
            "researcher@example.com": "dsa10ademo+researcher@gmail.com",
        }

        for legacy_email, new_email in legacy_demo_map.items():
            legacy_user = db.query(User).filter(User.email == legacy_email).first()
            if legacy_user and new_email not in existing_emails:
                legacy_user.email = new_email
                existing_emails.discard(legacy_email)
                existing_emails.add(new_email)
                changed = True

        if "dsa10ademo+admin@gmail.com" not in existing_emails:
            db.add(
                User(
                    email="dsa10ademo+admin@gmail.com",
                    full_name="Demo Admin",
                    role="admin",
                    hashed_password=hash_password("password"),
                )
            )
            changed = True

        if "dsa10ademo@gmail.com" not in existing_emails:
            db.add(
                User(
                    email="dsa10ademo@gmail.com",
                    full_name="Demo Admin",
                    role="admin",
                    hashed_password=hash_password("password"),
                )
            )
            changed = True

        if "dsa10ademo+management@gmail.com" not in existing_emails:
            db.add(
                User(
                    email="dsa10ademo+management@gmail.com",
                    full_name="Demo Management",
                    role="management",
                    hashed_password=hash_password("password"),
                )
            )
            changed = True

        if "dsa10ademo+researcher@gmail.com" not in existing_emails:
            db.add(
                User(
                    email="dsa10ademo+researcher@gmail.com",
                    full_name="Demo Researcher",
                    role="researcher",
                    hashed_password=hash_password("password"),
                )
            )
            changed = True

        if changed:
            db.commit() # Save these IDs into the permanent filing cabinet (the Database).
    finally:
        db.close()

# Create the APP
app = FastAPI(title=settings.APP_NAME)

# (http://localhost:5173,http://localhost:3000) and turns it into a Python list.
origins = [o.strip() for o in settings.BACKEND_CORS_ORIGINS.split(",") if o.strip()]

# set what website can talk to your API(backend).
"""
In Production (prod): It only allows the specific addresses in your origins list 
(like your real website URL).

In Development: It uses ["*"], which is a Wildcard. It tells the browser: "Let any website talk to me." 
This makes your life easier while coding so you don't get blocked during testing.
"""
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True, # It’s okay to send sensitive info.
    allow_methods=["*"], # This defines what actions the guest can take. Using ["*"] means: "I allow all types of actions."
    allow_headers=["*"], # what extra info can be sent in the request "envelope". ["*"] means: "I accept all types of headers."
)


@app.middleware("http")
async def audit_request_middleware(request: Request, call_next):
    # Record every authenticated API action as a durable audit trail.
    actor_user_id: int | None = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            email = payload.get("sub")
            if email:
                db = SessionLocal()
                try:
                    user = db.query(User).filter(User.email == email).first()
                    if user:
                        actor_user_id = user.id
                finally:
                    db.close()
        except JWTError:
            pass

    status_code = 500
    response = None
    try:
        response = await call_next(request)
        status_code = response.status_code
    finally:
        if actor_user_id is not None:
            db = SessionLocal()
            try:
                db.add(
                    AuditLog(
                        actor_user_id=actor_user_id,
                        action="API_CALL",
                        entity_type="API",
                        entity_id=0,
                        diff_json=AuditLog.dumps(
                            {
                                "method": request.method,
                                "path": request.url.path,
                                "query": request.url.query,
                                "status_code": status_code,
                            }
                        ),
                    )
                )
                db.commit()
            finally:
                db.close()

    return response

# Your app is split into different files (Auth, Projects, Analytics). 
# These lines act like extension cords, plugging those specific features into the main app.
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(projects.router, prefix=settings.API_V1_PREFIX)
app.include_router(analytics.router, prefix=settings.API_V1_PREFIX)
app.include_router(ingest.router, prefix=settings.API_V1_PREFIX)
app.include_router(assistant.router, prefix=settings.API_V1_PREFIX)

# This function runs automatically the moment you start the server.
@app.on_event("startup")
def on_startup() -> None:
    init_db() # Checks the database and creates any missing tables.
    _seed_users() # adds the "Demo" users if the database is empty.


@app.get("/health")
def health():
    return {"status": "ok"}
