from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.guards import require_write_access
from app.schemas import AccountCreate, AccountCreateResponse, AccountDetailOut, AccountOut, AccountStatementOut
from app.services.accounts import create_account, get_account, get_account_statement, list_accounts

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
def read_accounts(session: Session = Depends(get_db)):
    return list_accounts(session)


@router.post("", status_code=201, response_model=AccountCreateResponse)
def post_account(payload: AccountCreate, request: Request, session: Session = Depends(get_db)):
    require_write_access(request)
    try:
        return create_account(session, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/{account_id}", response_model=AccountDetailOut)
def read_account(account_id: UUID, session: Session = Depends(get_db)):
    account = get_account(session, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/{account_id}/statement", response_model=AccountStatementOut)
def read_account_statement(account_id: UUID, limit: int = 50, session: Session = Depends(get_db)):
    statement = get_account_statement(session, account_id, limit=limit)
    if statement is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return statement
