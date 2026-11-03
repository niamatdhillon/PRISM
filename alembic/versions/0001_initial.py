"""initial schema

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None
TS = sa.DateTime(timezone=True)


def upgrade():
    op.create_table("users", sa.Column("id", sa.Integer, primary_key=True), sa.Column("email", sa.String(255), nullable=False), sa.Column("password_hash", sa.String(255), nullable=False),
                    sa.Column("role", sa.String(20), nullable=False), sa.Column("is_active", sa.Boolean, nullable=False), sa.Column("failed_logins", sa.Integer, nullable=False),
                    sa.Column("locked_until", TS), sa.Column("created_at", TS, nullable=False), sa.Column("last_login_at", TS))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table("auth_sessions", sa.Column("id", sa.Integer, primary_key=True), sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("token_hash", sa.String(64), nullable=False), sa.Column("created_at", TS, nullable=False), sa.Column("expires_at", TS, nullable=False), sa.Column("revoked", sa.Boolean, nullable=False))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"]); op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=True)
    op.create_table("participants", sa.Column("id", sa.Integer, primary_key=True), sa.Column("code", sa.String(16), nullable=False), sa.Column("token_hash", sa.String(64), nullable=False),
                    sa.Column("status", sa.String(12), nullable=False), sa.Column("created_at", TS, nullable=False), sa.Column("withdrawn_at", TS))
    op.create_index("ix_participants_code", "participants", ["code"], unique=True); op.create_index("ix_participants_token_hash", "participants", ["token_hash"], unique=True)
    op.create_table("consents", sa.Column("id", sa.Integer, primary_key=True), sa.Column("participant_id", sa.Integer, sa.ForeignKey("participants.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("version", sa.String(32), nullable=False), sa.Column("text_sha256", sa.String(64), nullable=False), sa.Column("ethics_ref", sa.String(120), nullable=False),
                    sa.Column("given_at", TS, nullable=False), sa.Column("withdrawn_at", TS))
    op.create_index("ix_consents_participant_id", "consents", ["participant_id"])
    op.create_table("experiment_sessions", sa.Column("id", sa.String(64), primary_key=True), sa.Column("participant_id", sa.Integer, sa.ForeignKey("participants.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("started_at", TS, nullable=False), sa.Column("completed_at", TS), sa.Column("completed", sa.Boolean, nullable=False), sa.Column("protocol_version", sa.String(32), nullable=False),
                    sa.Column("device", sa.String(12), nullable=False), sa.Column("display_mode", sa.String(20), nullable=False), sa.Column("camera_used", sa.Boolean, nullable=False),
                    sa.Column("audio_enabled", sa.Boolean, nullable=False), sa.Column("condition", sa.JSON, nullable=False), sa.Column("ratings", sa.JSON, nullable=False),
                    sa.Column("timing", sa.JSON, nullable=False), sa.Column("reflection", sa.Text), sa.Column("created_at", TS, nullable=False))
    op.create_index("ix_experiment_sessions_participant_id", "experiment_sessions", ["participant_id"])
    op.create_table("trials", sa.Column("id", sa.Integer, primary_key=True), sa.Column("session_id", sa.String(64), sa.ForeignKey("experiment_sessions.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("idx", sa.Integer, nullable=False), sa.Column("task", sa.String(24), nullable=False), sa.Column("block", sa.Integer, nullable=False), sa.Column("modality", sa.String(16), nullable=False),
                    sa.Column("trial_type", sa.String(24)), sa.Column("set_size", sa.Integer), sa.Column("stimulus", sa.String(40)), sa.Column("response", sa.String(40)), sa.Column("correct", sa.Boolean),
                    sa.Column("rt_ms", sa.Float), sa.Column("onset_epoch_ms", sa.Float), sa.Column("timeout", sa.Boolean, nullable=False), sa.Column("anticipatory", sa.Boolean, nullable=False))
    op.create_index("ix_trials_session_id", "trials", ["session_id"]); op.create_index("ix_trials_session_idx", "trials", ["session_id", "idx"])
    op.create_table("study_config", sa.Column("key", sa.String(40), primary_key=True), sa.Column("value", sa.JSON, nullable=False), sa.Column("updated_at", TS, nullable=False), sa.Column("updated_by", sa.String(255)))
    op.create_table("datasets", sa.Column("id", sa.Integer, primary_key=True), sa.Column("slug", sa.String(40), nullable=False, unique=True), sa.Column("name", sa.String(200), nullable=False),
                    sa.Column("status", sa.String(20), nullable=False), sa.Column("meta", sa.JSON, nullable=False), sa.Column("summary", sa.JSON), sa.Column("ingested_at", TS))
    op.create_table("model_runs", sa.Column("id", sa.Integer, primary_key=True), sa.Column("kind", sa.String(24), nullable=False), sa.Column("dataset_slug", sa.String(40)), sa.Column("status", sa.String(24), nullable=False),
                    sa.Column("data_fingerprint", sa.String(64)), sa.Column("result", sa.JSON, nullable=False), sa.Column("created_at", TS, nullable=False), sa.Column("created_by", sa.String(255)))
    op.create_table("audit_log", sa.Column("id", sa.Integer, primary_key=True), sa.Column("ts", TS, nullable=False), sa.Column("actor_type", sa.String(16), nullable=False), sa.Column("actor", sa.String(255)),
                    sa.Column("action", sa.String(60), nullable=False), sa.Column("target", sa.String(120)), sa.Column("detail", sa.JSON))
    op.create_index("ix_audit_log_ts", "audit_log", ["ts"]); op.create_index("ix_audit_log_action", "audit_log", ["action"])
    op.create_table("app_errors", sa.Column("id", sa.Integer, primary_key=True), sa.Column("ts", TS, nullable=False), sa.Column("path", sa.String(200), nullable=False),
                    sa.Column("error_type", sa.String(80), nullable=False), sa.Column("message", sa.Text, nullable=False))
    op.create_index("ix_app_errors_ts", "app_errors", ["ts"])


def downgrade():
    for t in ["app_errors", "audit_log", "model_runs", "datasets", "study_config", "trials", "experiment_sessions", "consents", "participants", "auth_sessions", "users"]:
        op.drop_table(t)
