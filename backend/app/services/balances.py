from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Hold, HoldStatus, LedgerEntry, LedgerEntryDirection


def account_posted_balance_minor(session: Session, account_id: UUID) -> int:
    posted_balance = func.coalesce(
        func.sum(
            case(
                (LedgerEntry.direction == LedgerEntryDirection.CREDIT, LedgerEntry.amount),
                else_=-LedgerEntry.amount,
            )
        ),
        0,
    )
    value = session.execute(select(posted_balance).where(LedgerEntry.account_id == account_id)).scalar_one()
    return int(value or 0)


def account_held_balance_minor(session: Session, account_id: UUID) -> int:
    now = datetime.now(UTC)
    held_amount = func.coalesce(func.sum(Hold.amount), 0)
    value = session.execute(
        select(held_amount).where(
            Hold.account_id == account_id,
            Hold.status == HoldStatus.AUTHORIZED,
            Hold.expires_at > now,
        )
    ).scalar_one()
    return int(value or 0)


def account_balances_minor(session: Session, account_id: UUID) -> tuple[int, int, int]:
    posted = account_posted_balance_minor(session, account_id)
    held = account_held_balance_minor(session, account_id)
    return posted, held, posted - held
