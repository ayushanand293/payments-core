from __future__ import annotations

from fastapi import HTTPException, Request


def require_write_access(request: Request) -> None:
    settings = request.app.state.settings
    if settings.public_demo:
        raise HTTPException(
            status_code=403,
            detail={"code": "PUBLIC_DEMO_READ_ONLY", "message": "This public demo is read-only"},
        )
