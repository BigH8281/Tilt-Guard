"""phase1 baseline

Revision ID: 20260320_0001
Revises:
Create Date: 2026-03-20 10:30:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260320_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)

    op.create_table(
        "trading_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("session_name", sa.String(length=255), nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("market_bias", sa.String(length=255), nullable=False),
        sa.Column("htf_condition", sa.String(length=255), nullable=False),
        sa.Column("expected_open_type", sa.String(length=255), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("end_traded_my_time", sa.Boolean(), nullable=True),
        sa.Column("end_traded_my_conditions", sa.Boolean(), nullable=True),
        sa.Column("end_respected_my_exit", sa.Boolean(), nullable=True),
        sa.Column("reason_time_no", sa.Text(), nullable=True),
        sa.Column("reason_conditions_no", sa.Text(), nullable=True),
        sa.Column("reason_exit_no", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_trading_sessions_id"), "trading_sessions", ["id"], unique=False)
    op.create_index(op.f("ix_trading_sessions_user_id"), "trading_sessions", ["user_id"], unique=False)

    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["trading_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_journal_entries_id"), "journal_entries", ["id"], unique=False)
    op.create_index(op.f("ix_journal_entries_session_id"), "journal_entries", ["session_id"], unique=False)

    op.create_table(
        "screenshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("screenshot_type", sa.String(length=16), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["trading_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_screenshots_id"), "screenshots", ["id"], unique=False)
    op.create_index(op.f("ix_screenshots_session_id"), "screenshots", ["session_id"], unique=False)

    op.create_table(
        "trade_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=16), nullable=False),
        sa.Column("direction", sa.String(length=50), nullable=True),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("result_gbp", sa.Float(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("event_time", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["trading_sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_trade_events_id"), "trade_events", ["id"], unique=False)
    op.create_index(op.f("ix_trade_events_session_id"), "trade_events", ["session_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_trade_events_session_id"), table_name="trade_events")
    op.drop_index(op.f("ix_trade_events_id"), table_name="trade_events")
    op.drop_table("trade_events")

    op.drop_index(op.f("ix_screenshots_session_id"), table_name="screenshots")
    op.drop_index(op.f("ix_screenshots_id"), table_name="screenshots")
    op.drop_table("screenshots")

    op.drop_index(op.f("ix_journal_entries_session_id"), table_name="journal_entries")
    op.drop_index(op.f("ix_journal_entries_id"), table_name="journal_entries")
    op.drop_table("journal_entries")

    op.drop_index(op.f("ix_trading_sessions_user_id"), table_name="trading_sessions")
    op.drop_index(op.f("ix_trading_sessions_id"), table_name="trading_sessions")
    op.drop_table("trading_sessions")

    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
