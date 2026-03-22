"""broker telemetry slice

Revision ID: 20260321_0002
Revises: 20260320_0001
Create Date: 2026-03-21 10:15:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260321_0002"
down_revision: Union[str, Sequence[str], None] = "20260320_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "broker_telemetry_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("broker_adapter", sa.String(length=32), nullable=False),
        sa.Column("observation_key", sa.String(length=255), nullable=False),
        sa.Column("page_url", sa.Text(), nullable=False),
        sa.Column("page_title", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_broker_telemetry_events_id"), "broker_telemetry_events", ["id"], unique=False)
    op.create_index(
        op.f("ix_broker_telemetry_events_user_id"),
        "broker_telemetry_events",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_broker_telemetry_events_event_id"),
        "broker_telemetry_events",
        ["event_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_broker_telemetry_events_event_type"),
        "broker_telemetry_events",
        ["event_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_broker_telemetry_events_observation_key"),
        "broker_telemetry_events",
        ["observation_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_broker_telemetry_events_observation_key"), table_name="broker_telemetry_events")
    op.drop_index(op.f("ix_broker_telemetry_events_event_type"), table_name="broker_telemetry_events")
    op.drop_index(op.f("ix_broker_telemetry_events_event_id"), table_name="broker_telemetry_events")
    op.drop_index(op.f("ix_broker_telemetry_events_user_id"), table_name="broker_telemetry_events")
    op.drop_index(op.f("ix_broker_telemetry_events_id"), table_name="broker_telemetry_events")
    op.drop_table("broker_telemetry_events")
