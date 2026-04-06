from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.core.db import Base
from app.models.enums import TransactionStatus, TransactionType


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    type: Mapped[TransactionType] = mapped_column(SAEnum(TransactionType, name="transaction_type"), nullable=False)
    status: Mapped[TransactionStatus] = mapped_column(SAEnum(TransactionStatus, name="transaction_status"), nullable=False)
    currency_code: Mapped[str] = mapped_column(ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    ledger_entries = relationship("LedgerEntry", back_populates="transaction")
