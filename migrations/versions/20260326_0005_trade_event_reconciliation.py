"""trade event reconciliation

Revision ID: 20260326_0005
Revises: 20260325_0004
Create Date: 2026-03-26 19:30:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260326_0005"
down_revision: Union[str, Sequence[str], None] = "20260325_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = _column_names(inspector, "trade_events")
    indexes = _index_names(inspector, "trade_events")

    with op.batch_alter_table("trade_events", recreate="auto") as batch_op:
        if "symbol" not in columns:
            batch_op.add_column(sa.Column("symbol", sa.String(length=64), nullable=True))
        if "source" not in columns:
            batch_op.add_column(
                sa.Column("source", sa.String(length=16), nullable=False, server_default="manual")
            )
        if "reconciliation_state" not in columns:
            batch_op.add_column(
                sa.Column("reconciliation_state", sa.String(length=16), nullable=False, server_default="unmatched")
            )
        if "observed_episode_id" not in columns:
            batch_op.add_column(sa.Column("observed_episode_id", sa.String(length=128), nullable=True))

    inspector = sa.inspect(bind)
    indexes = _index_names(inspector, "trade_events")
    symbol_index = op.f("ix_trade_events_symbol")
    observed_episode_index = op.f("ix_trade_events_observed_episode_id")

    if symbol_index not in indexes:
        op.create_index(symbol_index, "trade_events", ["symbol"], unique=False)
    if observed_episode_index not in indexes:
        op.create_index(observed_episode_index, "trade_events", ["observed_episode_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = _column_names(inspector, "trade_events")
    indexes = _index_names(inspector, "trade_events")

    symbol_index = op.f("ix_trade_events_symbol")
    observed_episode_index = op.f("ix_trade_events_observed_episode_id")

    if observed_episode_index in indexes:
        op.drop_index(observed_episode_index, table_name="trade_events")
    if symbol_index in indexes:
        op.drop_index(symbol_index, table_name="trade_events")

    with op.batch_alter_table("trade_events", recreate="auto") as batch_op:
        if "observed_episode_id" in columns:
            batch_op.drop_column("observed_episode_id")
        if "reconciliation_state" in columns:
            batch_op.drop_column("reconciliation_state")
        if "source" in columns:
            batch_op.drop_column("source")
        if "symbol" in columns:
            batch_op.drop_column("symbol")
