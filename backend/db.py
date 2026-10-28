"""SQLite persistence (local mode only). Records are validated by schema.SessionRecord before insert."""
import json
import sqlite3
from typing import List, Optional
from .config import DB_PATH
from .schema import SessionRecord

_DDL = """
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY, participant_id TEXT NOT NULL, source TEXT NOT NULL,
  created_at TEXT NOT NULL, completed INTEGER NOT NULL, record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_source ON sessions(source);
"""


def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(str(DB_PATH))
    c.executescript(_DDL)
    return c


def save(rec: SessionRecord) -> None:
    with _conn() as c:
        c.execute("INSERT OR REPLACE INTO sessions VALUES (?,?,?,?,?,?)",
                  (rec.session_id, rec.participant_id, rec.source, rec.created_at, int(rec.completed), rec.model_dump_json()))


def list_sessions(source: Optional[str] = None) -> List[dict]:
    with _conn() as c:
        q = "SELECT record_json FROM sessions" + (" WHERE source=?" if source else "") + " ORDER BY created_at"
        rows = c.execute(q, (source,) if source else ()).fetchall()
    return [json.loads(r[0]) for r in rows]


def delete(source: Optional[str] = None) -> int:
    with _conn() as c:
        cur = c.execute("DELETE FROM sessions" + (" WHERE source=?" if source else ""), (source,) if source else ())
        return cur.rowcount
