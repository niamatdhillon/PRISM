"""Operational CLI.   python -m backend.cli <command>

  migrate                 apply database migrations (alembic upgrade head)
  create-admin EMAIL      create the first administrator; the password is read from a hidden prompt (or PRISM_ADMIN_PASSWORD for automation)
  purge-expired           enforce the configured retention period
"""
import argparse
import getpass
import os
import sys
from pathlib import Path


def migrate():
    from alembic import command
    from alembic.config import Config
    cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parent.parent / "alembic"))
    command.upgrade(cfg, "head")
    print("database is at the latest migration")


def create_admin(email: str, role: str = "admin"):
    from . import models, security
    from .db import SessionLocal
    pw = os.environ.get("PRISM_ADMIN_PASSWORD") or getpass.getpass(f"Password for {email} (min {security.MIN_PASSWORD_LEN} chars): ")
    if not os.environ.get("PRISM_ADMIN_PASSWORD") and getpass.getpass("Repeat password: ") != pw:
        sys.exit("passwords do not match")
    db = SessionLocal()
    try:
        if db.query(models.User).filter_by(email=email.lower()).first():
            sys.exit("a user with that email already exists")
        db.add(models.User(email=email.lower(), password_hash=security.hash_password(pw), role=role)); db.commit()
        print(f"created {role} {email.lower()}")
    finally:
        db.close()


def purge():
    from datetime import datetime, timedelta, timezone
    from . import models
    from .db import SessionLocal
    from .services import core
    db = SessionLocal()
    days = core.get_config(db, "retention", {"days": 0})["days"]
    if not days:
        print("retention is 0 (keep until deleted); nothing to do"); return
    n = db.query(models.ExperimentSession).filter(models.ExperimentSession.created_at < datetime.now(timezone.utc) - timedelta(days=days)).delete(synchronize_session=False)
    db.commit(); core.audit(db, "system", "cli", "retention_purge", detail={"days": days, "sessions": n}); print(f"purged {n} sessions older than {days} days")


def main():
    ap = argparse.ArgumentParser(prog="python -m backend.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate"); sub.add_parser("purge-expired")
    a = sub.add_parser("create-admin"); a.add_argument("email"); a.add_argument("--role", default="admin", choices=["admin", "researcher"])
    args = ap.parse_args()
    {"migrate": migrate, "purge-expired": purge}.get(args.cmd, lambda: create_admin(args.email, args.role))()


if __name__ == "__main__":
    main()
