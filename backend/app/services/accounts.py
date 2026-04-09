from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountType, Currency, LedgerEntry
from app.schemas import AccountCreate
from app.services.balances import account_balances_minor


def list_currencies(session: Session) -> list[dict]:
    currencies = session.execute(select(Currency).order_by(Currency.code)).scalars().all()
    return [{"code": currency.code, "minor_unit": currency.minor_unit} for currency in currencies]


def account_payload(account: Account, posted_balance_minor: int, held_balance_minor: int) -> dict:
    posted = int(posted_balance_minor)
    held = int(held_balance_minor)
    return {
        "id": account.id,
        "name": account.name,
        "currency_code": account.currency_code,
        "type": account.type.value,
        "created_at": account.created_at,
        "posted_balance_minor": posted,
        "held_balance_minor": held,
        "available_balance_minor": posted - held,
    }


def list_accounts(session: Session) -> list[dict]:
    accounts = session.execute(select(Account).order_by(Account.created_at, Account.name)).scalars().all()
    payload: list[dict] = []
    for account in accounts:
        posted, held, _available = account_balances_minor(session, account.id)
        payload.append(account_payload(account, posted, held))
    return payload


def get_account(session: Session, account_id: UUID) -> dict | None:
    account = session.get(Account, account_id)
    if account is None:
        return None

    posted, held, _available = account_balances_minor(session, account.id)
    return account_payload(account, posted, held)


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
    return account_payload(account, 0, 0)


def get_account_statement(session: Session, account_id: UUID, *, limit: int = 50) -> dict | None:
    account = session.get(Account, account_id)
    if account is None:
        return None

    posted, held, _available = account_balances_minor(session, account_id)

    entries = session.execute(
        select(LedgerEntry).where(LedgerEntry.account_id == account_id).order_by(LedgerEntry.created_at.desc(), LedgerEntry.id.desc()).limit(limit)
    ).scalars().all()

    return {
        "account": account_payload(account, posted, held),
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
