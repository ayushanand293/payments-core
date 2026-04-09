from __future__ import annotations

import enum


class AccountType(str, enum.Enum):
    USER = "USER"
    ESCROW = "ESCROW"
    MERCHANT = "MERCHANT"


class TransactionType(str, enum.Enum):
    TRANSFER = "TRANSFER"
    DEPOSIT = "DEPOSIT"
    HOLD_CAPTURE = "HOLD_CAPTURE"


class TransactionStatus(str, enum.Enum):
    POSTED = "POSTED"
    FAILED = "FAILED"


class LedgerEntryDirection(str, enum.Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


class HoldStatus(str, enum.Enum):
    AUTHORIZED = "AUTHORIZED"
    CAPTURED = "CAPTURED"
    RELEASED = "RELEASED"
    EXPIRED = "EXPIRED"
