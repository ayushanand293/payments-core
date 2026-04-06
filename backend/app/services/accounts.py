from __future__ import annotations

from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Account, AccountType, Currency, LedgerEntry, LedgerEntryDirection
from app.schemas import AccountCreate


def list_currencies(session: Session) -> list[dict]:
    currencies = session.execute(select(Currency).order_by(Currency.code)).scalars().all()
    return [{"code": currency.code, "minor_unit": currency.minor_unit} for currency in currencies]


def account_payload(account: Account, posted_balance_minor: int) -> dict:
    balance = int(posted_balance_minor)
    return {
        "id": account.id,
        "name": account.name,
        "currency_code": account.currency_code,
        "type": account.type.value,
        "created_at": account.created_at,
        "posted_balance_minor": balance,
        "held_balance_minor": 0,
        "available_balance_minor": balance,
    }


def list_accounts(session: Session) -> list[dict]:
    posted_balance = func.coalesce(
        func.sum(
            case(
                (LedgerEntry.direction == LedgerEntryDirection.CREDIT, LedgerEntry.amount),
                else_=-LedgerEntry.amount,
            )
        ),
        0,
    )

    rows = session.execute(
        select(Account, posted_balance.label("posted_balance_minor"))
        .outerjoin(LedgerEntry, LedgerEntry.account_id == Account.id)
        .group_by(Account.id)
        .order_by(Account.created_at, Account.name)
    ).all()

    return [account_payload(account, posted_balance_minor or 0) for account, posted_balance_minor in rows]


def get_account(session: Session, account_id: UUID) -> dict | None:
    posted_balance = func.coalesce(
        func.sum(
            case(
                (LedgerEntry.direction == LedgerEntryDirection.CREDIT, LedgerEntry.amount),
                else_=-LedgerEntry.amount,
            )
        ),
        0,
    )

    row = session.execute(
        select(Account, posted_balance.label("posted_balance_minor")).outerjoin(LedgerEntry, LedgerEntry.account_id == Account.id).where(Account.id == account_id).group_by(Account.id)
    ).one_or_none()
    if row is None:
        return None

    account, posted_balance_minor = row
    return account_payload(account, posted_balance_minor or 0)


def create_account(session: Session, payload: AccountCreate) -> dict:
    normalized_type = payload.type.upper()
    if normalized_type not in {AccountType.USER.value, AccountType.MERCHANT.value}:
        raise ValueError("ESCROW accounts are system-managed")

    currency = session.get(Currency, payload.currency_code)
    if currency is None:
        raise ValueError("Currency not found")

    account = Account(name=payload.name, currency_code=payload.currency_code, type=AccountType(normalized_type))
    session.add(account)
    session.commit()
    session.refresh(account)
    return account_payload(account, 0)


def get_account_statement(session: Session, account_id: UUID, *, limit: int = 50) -> dict | None:
    account = session.get(Account, account_id)
    if account is None:
        return None

    posted_balance = func.coalesce(
        func.sum(
            case(
                (LedgerEntry.direction == LedgerEntryDirection.CREDIT, LedgerEntry.amount),
                else_=-LedgerEntry.amount,
            )
        ),
        0,
    )
    posted_balance_minor = session.execute(select(posted_balance).where(LedgerEntry.account_id == account_id)).scalar_one()

    entries = session.execute(
        select(LedgerEntry).where(LedgerEntry.account_id == account_id).order_by(LedgerEntry.created_at, LedgerEntry.id).limit(limit)
    ).scalars().all()

    return {
        "account": account_payload(account, posted_balance_minor or 0),
        "ledger_entries": [
            {
                "id": entry.id,
                "tx_id": entry.tx_id,
                "account_id": entry.account_id,
                "currency_code": entry.currency_code,
                "direction": entry.direction.value,
                "amount_minor": entry.amount,
                "created_at": entry.created_at,
            }
            for entry in entries
        ],
    }
