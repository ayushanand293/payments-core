"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-04-06 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


account_type = sa.Enum("USER", "ESCROW", "MERCHANT", name="account_type")
transaction_type = sa.Enum("TRANSFER", "DEPOSIT", name="transaction_type")
transaction_status = sa.Enum("POSTED", "FAILED", name="transaction_status")
ledger_entry_direction = sa.Enum("DEBIT", "CREDIT", name="ledger_entry_direction")


def upgrade() -> None:
    bind = op.get_bind()
    account_type.create(bind, checkfirst=True)
    transaction_type.create(bind, checkfirst=True)
    transaction_status.create(bind, checkfirst=True)
    ledger_entry_direction.create(bind, checkfirst=True)

    op.create_table(
        "currencies",
        sa.Column("code", sa.String(length=3), nullable=False),
        sa.Column("minor_unit", sa.SmallInteger(), nullable=False),
        sa.PrimaryKeyConstraint("code"),
    )

    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("type", account_type, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_accounts_currency_code"), "accounts", ["currency_code"], unique=False)

    op.create_table(
        "escrow_accounts",
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("currency_code"),
        sa.UniqueConstraint("account_id", name="uq_escrow_accounts_account_id"),
    )

    op.create_table(
        "idempotency_keys",
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("scope", sa.String(length=100), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_json", sa.JSON(), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )

    op.create_table(
        "transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("type", transaction_type, nullable=False),
        sa.Column("status", transaction_status, nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_transactions_idempotency_key"),
    )
    op.create_index(op.f("ix_transactions_currency_code"), "transactions", ["currency_code"], unique=False)
    op.create_index(op.f("ix_transactions_idempotency_key"), "transactions", ["idempotency_key"], unique=True)

    op.create_table(
        "ledger_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tx_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("direction", ledger_entry_direction, nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["tx_id"], ["transactions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ledger_entries_account_id"), "ledger_entries", ["account_id"], unique=False)
    op.create_index(op.f("ix_ledger_entries_currency_code"), "ledger_entries", ["currency_code"], unique=False)
    op.create_index(op.f("ix_ledger_entries_tx_id"), "ledger_entries", ["tx_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ledger_entries_tx_id"), table_name="ledger_entries")
    op.drop_index(op.f("ix_ledger_entries_currency_code"), table_name="ledger_entries")
    op.drop_index(op.f("ix_ledger_entries_account_id"), table_name="ledger_entries")
    op.drop_table("ledger_entries")

    op.drop_index(op.f("ix_transactions_idempotency_key"), table_name="transactions")
    op.drop_index(op.f("ix_transactions_currency_code"), table_name="transactions")
    op.drop_table("transactions")

    op.drop_table("idempotency_keys")
    op.drop_table("escrow_accounts")
    op.drop_index(op.f("ix_accounts_currency_code"), table_name="accounts")
    op.drop_table("accounts")
    op.drop_table("currencies")

    bind = op.get_bind()
    ledger_entry_direction.drop(bind, checkfirst=True)
    transaction_status.drop(bind, checkfirst=True)
    transaction_type.drop(bind, checkfirst=True)
    account_type.drop(bind, checkfirst=True)
