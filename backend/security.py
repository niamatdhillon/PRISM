"""Password hashing, opaque session tokens, cookies and FastAPI authorisation dependencies.

Design: staff authenticate with email+password (Argon2id) and receive an opaque random token in an httpOnly cookie; only its
SHA-256 is stored server-side. Participants have no account: a random secret (cookie / recovery code) identifies a
pseudonymous participant row. Authorisation is enforced here, server-side, on every protected endpoint.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from . import config, models
from .db import get_db

ADMIN_COOKIE, PARTICIPANT_COOKIE = "prism_admin", "prism_pt"
MIN_PASSWORD_LEN = 12


_ph = PasswordHasher()  # Argon2id with library defaults (OWASP-recommended family)


def hash_password(pw: str) -> str:
    if len(pw) < MIN_PASSWORD_LEN:
        raise ValueError(f"password must be at least {MIN_PASSWORD_LEN} characters")
    return _ph.hash(pw)


def verify_password(pw: str, stored: str) -> bool:
    try:
        return _ph.verify(stored, pw)
    except (VerifyMismatchError, InvalidHashError, Exception):  # noqa: BLE001 - any failure is a failed login
        return False


_DUMMY = hash_password("dummy-password-for-timing-equalisation")


def sha(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def set_cookie(resp: Response, name: str, value: str, max_age: int):
    resp.set_cookie(name, value, max_age=max_age, httponly=True, samesite="lax", secure=config.COOKIE_SECURE, path="/")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)  # SQLite returns naive datetimes


def login(db: Session, email: str, password: str) -> Optional[models.User]:
    """Returns the user on success. Always does a hash computation, locks the account after repeated failures."""
    u = db.query(models.User).filter(models.User.email == email.strip().lower()).first()
    if u is None:
        verify_password(password, _DUMMY)
        return None
    locked = _aware(u.locked_until)
    if locked and locked > utcnow():
        verify_password(password, _DUMMY)
        return None
    ok = u.is_active and verify_password(password, u.password_hash)
    if ok:
        u.failed_logins, u.locked_until, u.last_login_at = 0, None, utcnow()
    else:
        u.failed_logins += 1
        if u.failed_logins >= config.LOGIN_MAX_FAILS:
            u.locked_until, u.failed_logins = utcnow() + timedelta(minutes=config.LOGIN_LOCK_MINUTES), 0
    db.commit()
    return u if ok else None


def create_auth_session(db: Session, user: models.User) -> str:
    tok = new_token()
    db.add(models.AuthSession(user_id=user.id, token_hash=sha(tok), expires_at=utcnow() + timedelta(hours=config.ADMIN_SESSION_HOURS)))
    db.commit()
    return tok


def current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    tok = request.cookies.get(ADMIN_COOKIE)
    if not tok:
        raise HTTPException(401, "authentication required")
    s = db.query(models.AuthSession).filter(models.AuthSession.token_hash == sha(tok), models.AuthSession.revoked.is_(False)).first()
    if not s or _aware(s.expires_at) < utcnow():
        raise HTTPException(401, "session expired or invalid")
    u = db.get(models.User, s.user_id)
    if not u or not u.is_active:
        raise HTTPException(401, "account disabled")
    return u


def require_roles(*roles: str):
    def dep(user: models.User = Depends(current_user)) -> models.User:
        if user.role not in roles:
            raise HTTPException(403, "insufficient permissions")
        return user
    return dep


require_staff = require_roles("admin", "researcher")
require_admin = require_roles("admin")


def current_participant(request: Request, db: Session = Depends(get_db)) -> models.Participant:
    tok = request.cookies.get(PARTICIPANT_COOKIE)
    if not tok:
        raise HTTPException(401, "participant token required")
    p = db.query(models.Participant).filter(models.Participant.token_hash == sha(tok)).first()
    if not p or p.status != "active":
        raise HTTPException(401, "unknown or withdrawn participant")
    return p
