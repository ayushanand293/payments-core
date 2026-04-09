from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.core.db import Base
from app.models.enums import HoldStatus


class Hold(Base):
    __tablename__ = "holds"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    account_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False, index=True)
    currency_code: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[HoldStatus] = mapped_column(SAEnum(HoldStatus, name="hold_status"), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    captured_tx_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("transactions.id", ondelete="RESTRICT"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
