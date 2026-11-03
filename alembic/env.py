from alembic import context
from sqlalchemy import create_engine

from backend import config, models  # noqa: F401  (models import registers metadata)
from backend.db import Base

target_metadata = Base.metadata


def _url() -> str:
    return context.get_x_argument(as_dictionary=True).get("url") or config.DATABASE_URL


def run_migrations_online():
    engine = create_engine(_url())
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, render_as_batch=_url().startswith("sqlite"))
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
