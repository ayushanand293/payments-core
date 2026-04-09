"""add reconcile runs table

Revision ID: 0002_reconcile_runs
Revises: 0001_initial
Create Date: 2026-04-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_reconcile_runs"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reconcile_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ran_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("report_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_reconcile_runs_ran_at"), "reconcile_runs", ["ran_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_reconcile_runs_ran_at"), table_name="reconcile_runs")
    op.drop_table("reconcile_runs")
