"""current pre-session briefings

Revision ID: 20260402_0006
Revises: 20260326_0005
Create Date: 2026-04-02 11:20:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260402_0006"
down_revision: Union[str, Sequence[str], None] = "20260326_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_names(inspector: sa.Inspector) -> set[str]:
    return set(inspector.get_table_names())


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "current_pre_session_briefings" not in _table_names(inspector):
        op.create_table(
            "current_pre_session_briefings",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", name="uq_current_pre_session_briefings_user_id"),
        )

    inspector = sa.inspect(bind)
    indexes = _index_names(inspector, "current_pre_session_briefings")
    id_index = op.f("ix_current_pre_session_briefings_id")
    user_index = op.f("ix_current_pre_session_briefings_user_id")

    if id_index not in indexes:
        op.create_index(id_index, "current_pre_session_briefings", ["id"], unique=False)
    if user_index not in indexes:
        op.create_index(user_index, "current_pre_session_briefings", ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "current_pre_session_briefings" not in _table_names(inspector):
        return

    indexes = _index_names(inspector, "current_pre_session_briefings")
    id_index = op.f("ix_current_pre_session_briefings_id")
    user_index = op.f("ix_current_pre_session_briefings_user_id")

    if user_index in indexes:
        op.drop_index(user_index, table_name="current_pre_session_briefings")
    if id_index in indexes:
        op.drop_index(id_index, table_name="current_pre_session_briefings")

    op.drop_table("current_pre_session_briefings")
