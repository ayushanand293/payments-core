from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CurrencyOut(BaseModel):
    code: str
    minor_unit: int


class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    currency_code: str = Field(min_length=3, max_length=3)
    type: str


class TransferCreate(BaseModel):
    from_account_id: UUID
    to_account_id: UUID
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    amount_minor: int = Field(gt=0)
    description: str | None = None


class DemoFundCreate(BaseModel):
    account_id: UUID
    amount: int = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)


class LedgerEntryOut(BaseModel):
    id: UUID
    tx_id: UUID
    account_id: UUID
    currency_code: str
    direction: str
    amount_minor: int
    created_at: datetime | None = None


class TransactionOut(BaseModel):
    id: UUID
    type: str
    status: str
    currency_code: str
    idempotency_key: str
    description: str | None = None
    created_at: datetime | None = None
    balanced: bool | None = None


class TransactionDetailOut(TransactionOut):
    ledger_entries: list[LedgerEntryOut]


class AccountOut(BaseModel):
    id: UUID
    name: str
    currency_code: str
    type: str
    created_at: datetime | None = None
    posted_balance_minor: int
    held_balance_minor: int
    available_balance_minor: int


class AccountCreateResponse(AccountOut):
    pass


class AccountDetailOut(AccountOut):
    pass


class AccountStatementOut(BaseModel):
    account: AccountOut
    ledger_entries: list[LedgerEntryOut]
