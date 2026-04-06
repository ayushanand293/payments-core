from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, DateTime, Enum as SAEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.db import Base
from app.models.enums import LedgerEntryDirection


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    tx_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("transactions.id", ondelete="RESTRICT"), nullable=False, index=True)
    account_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False, index=True)
    currency_code: Mapped[str] = mapped_column(ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False, index=True)
    direction: Mapped[LedgerEntryDirection] = mapped_column(SAEnum(LedgerEntryDirection, name="ledger_entry_direction"), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    transaction = relationship("Transaction", back_populates="ledger_entries")
    account = relationship("Account", back_populates="ledger_entries")
