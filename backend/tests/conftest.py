from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.db import Base, create_engine_and_session
from app.main import create_app
from app.seed import seed_demo_data


@pytest.fixture()
def temp_database_url() -> str:
    with TemporaryDirectory() as temp_dir:
        database_path = Path(temp_dir) / "test.db"
        yield f"sqlite+pysqlite:///{database_path}"


@pytest.fixture()
def app(temp_database_url: str):
    settings = Settings(
        database_url=temp_database_url,
        auto_seed=False,
        cors_origins=["http://testserver"],
    )
    application = create_app(settings)
    engine = application.state.engine
    Base.metadata.create_all(engine)
    with application.state.session_factory() as session:
        seed_demo_data(session)
    return application


@pytest.fixture()
def client(app):
    with TestClient(app) as test_client:
        yield test_client

