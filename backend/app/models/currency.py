from __future__ import annotations

from sqlalchemy import SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Currency(Base):
    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(String(3), primary_key=True)
    minor_unit: Mapped[int] = mapped_column(SmallInteger, nullable=False)
