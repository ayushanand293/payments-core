from __future__ import annotations

from collections.abc import Generator

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def create_engine_and_session(database_url: str):
    connect_args = {}
    if database_url.startswith(("postgresql://", "postgresql+psycopg://")):
        # Disable psycopg3 prepared statements for PgBouncer/Supabase transaction pooler compatibility.
        connect_args["prepare_threshold"] = None

    engine = create_engine(
        database_url,
        future=True,
        pool_pre_ping=True,
        connect_args=connect_args,
    )
    session_factory = sessionmaker(bind=engine, class_=Session, autoflush=False, expire_on_commit=False)
    return engine, session_factory


def get_db(request: Request) -> Generator[Session, None, None]:
    session_factory = request.app.state.session_factory
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
