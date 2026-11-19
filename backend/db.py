from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config


class Base(DeclarativeBase):
    pass


def _make_engine(url: str):
    if url.startswith("sqlite"):
        config.VAR_DIR.mkdir(parents=True, exist_ok=True)
        eng = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(eng, "connect")
        def _fk(dbapi_con, _):  # enforce FK cascades on SQLite
            dbapi_con.execute("PRAGMA foreign_keys=ON")
        return eng
    if config.ON_VERCEL:  # serverless: no long-lived pool; the provider's pooler (e.g. Neon) handles connection reuse
        from sqlalchemy.pool import NullPool
        return create_engine(url, poolclass=NullPool, pool_pre_ping=True)
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


engine = _make_engine(config.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
