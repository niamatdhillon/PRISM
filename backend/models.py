"""Relational schema. Migrations live in alembic/ (0001_initial mirrors this file)."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):  # staff accounts only (admin / researcher); participants are pseudonymous and have no account
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))  # admin | researcher
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class Participant(Base):
    __tablename__ = "participants"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)  # pseudonymous, shown to the participant
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # sha256 of the secret held in their cookie / recovery code
    status: Mapped[str] = mapped_column(String(12), default="active")  # active | withdrawn
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    withdrawn_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    consents = relationship("Consent", cascade="all, delete-orphan", back_populates="participant")
    sessions = relationship("ExperimentSession", cascade="all, delete-orphan", back_populates="participant")


class Consent(Base):  # retained after withdrawal (minimal audit evidence: code, version, timestamps; no behavioural data)
    __tablename__ = "consents"
    id: Mapped[int] = mapped_column(primary_key=True)
    participant_id: Mapped[int] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), index=True)
    version: Mapped[str] = mapped_column(String(32))
    text_sha256: Mapped[str] = mapped_column(String(64))
    ethics_ref: Mapped[str] = mapped_column(String(120))
    given_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    withdrawn_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    participant = relationship("Participant", back_populates="consents")


class ExperimentSession(Base):
    __tablename__ = "experiment_sessions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    participant_id: Mapped[int] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    protocol_version: Mapped[str] = mapped_column(String(32))
    device: Mapped[str] = mapped_column(String(12))
    display_mode: Mapped[str] = mapped_column(String(20))
    camera_used: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    condition: Mapped[dict] = mapped_column(JSON)
    ratings: Mapped[dict] = mapped_column(JSON)
    timing: Mapped[dict] = mapped_column(JSON, default=dict)
    reflection: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    participant = relationship("Participant", back_populates="sessions")
    trials = relationship("Trial", cascade="all, delete-orphan", order_by="Trial.idx", back_populates="session")


class Trial(Base):
    __tablename__ = "trials"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("experiment_sessions.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    task: Mapped[str] = mapped_column(String(24))
    block: Mapped[int] = mapped_column(Integer, default=0)
    modality: Mapped[str] = mapped_column(String(16), default="visual")
    trial_type: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    set_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stimulus: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    response: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    correct: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    rt_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    onset_epoch_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    timeout: Mapped[bool] = mapped_column(Boolean, default=False)
    anticipatory: Mapped[bool] = mapped_column(Boolean, default=False)
    session = relationship("ExperimentSession", back_populates="trials")
    __table_args__ = (Index("ix_trials_session_idx", "session_id", "idx"),)


class StudyConfig(Base):  # key/value JSON: 'ethics', 'retention', 'ollama'
    __tablename__ = "study_config"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class Dataset(Base):
    __tablename__ = "datasets"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="not_ingested")  # not_ingested | ingested | failed
    meta: Mapped[dict] = mapped_column(JSON)  # provenance, licence, URL, sizes, checks
    summary: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # filled by ingestion (counts, features, missingness)
    ingested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ModelRun(Base):
    __tablename__ = "model_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(24))  # behavioural | public_eeg | rag_eval
    dataset_slug: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(24))  # ok | insufficient_data | failed
    data_fingerprint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    created_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    actor_type: Mapped[str] = mapped_column(String(16))  # admin | researcher | participant | system | anonymous
    actor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    target: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    detail: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class AppError(Base):
    __tablename__ = "app_errors"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    path: Mapped[str] = mapped_column(String(200))
    error_type: Mapped[str] = mapped_column(String(80))
    message: Mapped[str] = mapped_column(Text)
