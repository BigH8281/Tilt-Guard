"""trade evidence linkage

Revision ID: 20260325_0004
Revises: 20260324_0003
Create Date: 2026-03-25 12:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260325_0004"
down_revision: Union[str, Sequence[str], None] = "20260324_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _foreign_key_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {foreign_key["name"] for foreign_key in inspector.get_foreign_keys(table_name) if foreign_key.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = _column_names(inspector, "broker_telemetry_events")
    indexes = _index_names(inspector, "broker_telemetry_events")
    foreign_keys = _foreign_key_names(inspector, "broker_telemetry_events")

    if "extension_session_key" not in columns:
        op.add_column("broker_telemetry_events", sa.Column("extension_session_key", sa.String(length=36), nullable=True))
    if "trading_session_id" not in columns:
        op.add_column("broker_telemetry_events", sa.Column("trading_session_id", sa.Integer(), nullable=True))

    extension_session_index = op.f("ix_broker_telemetry_events_extension_session_key")
    trading_session_index = op.f("ix_broker_telemetry_events_trading_session_id")

    if extension_session_index not in indexes:
        op.create_index(extension_session_index, "broker_telemetry_events", ["extension_session_key"], unique=False)
    if trading_session_index not in indexes:
        op.create_index(trading_session_index, "broker_telemetry_events", ["trading_session_id"], unique=False)

    foreign_key_name = "fk_broker_telemetry_events_trading_session_id"
    if foreign_key_name not in foreign_keys:
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("broker_telemetry_events", recreate="always") as batch_op:
                batch_op.create_foreign_key(
                    foreign_key_name,
                    "trading_sessions",
                    ["trading_session_id"],
                    ["id"],
                )
        else:
            op.create_foreign_key(
                foreign_key_name,
                "broker_telemetry_events",
                "trading_sessions",
                ["trading_session_id"],
                ["id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = _column_names(inspector, "broker_telemetry_events")
    indexes = _index_names(inspector, "broker_telemetry_events")
    foreign_keys = _foreign_key_names(inspector, "broker_telemetry_events")

    foreign_key_name = "fk_broker_telemetry_events_trading_session_id"
    if foreign_key_name in foreign_keys:
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("broker_telemetry_events", recreate="always") as batch_op:
                batch_op.drop_constraint(foreign_key_name, type_="foreignkey")
        else:
            op.drop_constraint(foreign_key_name, "broker_telemetry_events", type_="foreignkey")

    extension_session_index = op.f("ix_broker_telemetry_events_extension_session_key")
    trading_session_index = op.f("ix_broker_telemetry_events_trading_session_id")
    if trading_session_index in indexes:
        op.drop_index(trading_session_index, table_name="broker_telemetry_events")
    if extension_session_index in indexes:
        op.drop_index(extension_session_index, table_name="broker_telemetry_events")
    if "trading_session_id" in columns:
        op.drop_column("broker_telemetry_events", "trading_session_id")
    if "extension_session_key" in columns:
        op.drop_column("broker_telemetry_events", "extension_session_key")
