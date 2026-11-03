from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .. import config, models, security
from ..db import get_db
from ..schemas import LoginIn
from ..services import core

router = APIRouter(prefix="/api/auth")


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    u = security.login(db, body.email, body.password)
    if not u:
        core.audit(db, "anonymous", body.email[:80], "login_failed")
        raise HTTPException(401, "invalid credentials or account locked")
    tok = security.create_auth_session(db, u)
    security.set_cookie(response, security.ADMIN_COOKIE, tok, config.ADMIN_SESSION_HOURS * 3600)
    core.audit(db, u.role, u.email, "login")
    return {"email": u.email, "role": u.role}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    tok = request.cookies.get(security.ADMIN_COOKIE)
    if tok:
        s = db.query(models.AuthSession).filter_by(token_hash=security.sha(tok)).first()
        if s:
            s.revoked = True; db.commit()
    response.delete_cookie(security.ADMIN_COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(u: models.User = Depends(security.current_user)):
    return {"email": u.email, "role": u.role}
