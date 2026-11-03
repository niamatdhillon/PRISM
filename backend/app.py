"""PRISM API. Public + participant routes, staff authentication, and role-protected admin routes."""
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import config, models
from .db import SessionLocal
from .routers import admin, admin_lab, auth, participant, public

log = logging.getLogger("prism")
app = FastAPI(title="PRISM API", version="2.0.0", docs_url="/api/docs" if not config.IS_PROD else None, openapi_url="/api/openapi.json" if not config.IS_PROD else None)

SAFE = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def csrf_and_headers(request: Request, call_next):
    # Mutating requests must carry a custom header: browsers cannot add it cross-site without a CORS preflight (CORS is not enabled),
    # which together with SameSite=Lax cookies blocks cross-site request forgery.
    if request.method not in SAFE and request.url.path.startswith("/api") and request.headers.get("x-prism-client") != "web":
        return JSONResponse({"detail": "missing X-PRISM-Client header"}, status_code=403)
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), xr-spatial-tracking=(self)")
    resp.headers.setdefault("Cache-Control", "no-store")
    return resp


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("unhandled error on %s", request.url.path)
    try:
        db = SessionLocal()
        db.add(models.AppError(path=request.url.path[:200], error_type=type(exc).__name__, message=str(exc)[:2000])); db.commit(); db.close()
    except Exception:  # noqa: BLE001
        pass
    return JSONResponse({"detail": "internal server error"}, status_code=500)


for r in (public.router, participant.router, auth.router, admin.router, admin_lab.router):
    app.include_router(r)


@app.on_event("startup")
def _startup():
    # Apply migrations at startup so a fresh database (SQLite or Postgres) is always usable; failures are logged, not hidden.
    try:
        from .cli import migrate
        migrate()
    except Exception:  # noqa: BLE001
        log.exception("migration failed at startup")
