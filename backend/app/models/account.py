from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.db import Base
from app.models.enums import AccountType


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    currency_code: Mapped[str] = mapped_column(ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False, index=True)
    type: Mapped[AccountType] = mapped_column(SAEnum(AccountType, name="account_type"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    ledger_entries = relationship("LedgerEntry", back_populates="account")


class EscrowAccount(Base):
    __tablename__ = "escrow_accounts"
    __table_args__ = (UniqueConstraint("account_id", name="uq_escrow_accounts_account_id"),)

    currency_code: Mapped[str] = mapped_column(ForeignKey("currencies.code", ondelete="RESTRICT"), primary_key=True)
    account_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("accounts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    account = relationship("Account")
