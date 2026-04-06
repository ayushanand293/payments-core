from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas import CurrencyOut
from app.services.accounts import list_currencies

router = APIRouter(tags=["currencies"])


@router.get("/currencies", response_model=list[CurrencyOut])
def read_currencies(session: Session = Depends(get_db)):
    return list_currencies(session)
