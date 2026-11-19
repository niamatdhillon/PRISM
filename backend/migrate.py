"""Schema management safe for serverless cold starts: apply migrations only when needed, under a Postgres advisory lock."""
import logging
from pathlib import Path

from sqlalchemy import text

log = logging.getLogger("prism")
ROOT = Path(__file__).resolve().parent.parent
_LOCK_KEY = 7_203_113  # arbitrary app-wide advisory lock id
_done = False


def _alembic_cfg():
    from alembic.config import Config
    cfg = Config(); cfg.set_main_option("script_location", str(ROOT / "alembic"))   # no alembic.ini needed in the serverless bundle
    return cfg


def current_and_head():
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory
    from .db import engine
    head = ScriptDirectory.from_config(_alembic_cfg()).get_current_head()
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision(), head


def ensure_schema(force: bool = False) -> bool:
    """Returns True if migrations were applied. Cheap when the schema is already current."""
    global _done
    if _done and not force:
        return False
    from alembic import command
    from .db import engine
    cur, head = current_and_head()
    if cur == head:
        _done = True; return False
    if engine.dialect.name == "postgresql":
        with engine.connect() as conn:
            conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _LOCK_KEY}); conn.commit()
            try:
                cur, head = current_and_head()      # another instance may have migrated while we waited
                if cur != head:
                    command.upgrade(_alembic_cfg(), "head")
            finally:
                conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _LOCK_KEY}); conn.commit()
    else:
        command.upgrade(_alembic_cfg(), "head")
    _done = True
    log.warning("database migrated to %s", head)
    return True
