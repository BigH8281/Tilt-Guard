"""extension sessions slice

Revision ID: 20260324_0003
Revises: 20260321_0002
Create Date: 2026-03-24 22:20:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260324_0003"
down_revision: Union[str, Sequence[str], None] = "20260321_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "extension_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_key", sa.String(length=36), nullable=False),
        sa.Column("extension_id", sa.String(length=64), nullable=False),
        sa.Column("extension_version", sa.String(length=32), nullable=True),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("extension_state", sa.String(length=64), nullable=False),
        sa.Column("monitoring_state", sa.String(length=64), nullable=False),
        sa.Column("tradingview_detected", sa.Boolean(), nullable=False),
        sa.Column("broker_adapter", sa.String(length=64), nullable=True),
        sa.Column("broker_profile", sa.String(length=128), nullable=True),
        sa.Column("adapter_confidence", sa.Float(), nullable=False),
        sa.Column("adapter_reliability", sa.String(length=32), nullable=True),
        sa.Column("warning_message", sa.Text(), nullable=True),
        sa.Column("current_tab_url", sa.Text(), nullable=True),
        sa.Column("current_tab_title", sa.Text(), nullable=True),
        sa.Column("status_payload", sa.JSON(), nullable=True),
        sa.Column("connected_at", sa.DateTime(), nullable=False),
        sa.Column("last_heartbeat_at", sa.DateTime(), nullable=False),
        sa.Column("disconnected_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_extension_sessions_id"), "extension_sessions", ["id"], unique=False)
    op.create_index(op.f("ix_extension_sessions_user_id"), "extension_sessions", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_extension_sessions_session_key"),
        "extension_sessions",
        ["session_key"],
        unique=True,
    )
    op.create_index(
        op.f("ix_extension_sessions_extension_id"),
        "extension_sessions",
        ["extension_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_extension_sessions_extension_id"), table_name="extension_sessions")
    op.drop_index(op.f("ix_extension_sessions_session_key"), table_name="extension_sessions")
    op.drop_index(op.f("ix_extension_sessions_user_id"), table_name="extension_sessions")
    op.drop_index(op.f("ix_extension_sessions_id"), table_name="extension_sessions")
    op.drop_table("extension_sessions")
