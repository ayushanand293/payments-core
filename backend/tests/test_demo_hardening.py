from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.db import Base
from app.main import create_app


def _client_for(settings: Settings):
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    return TestClient(app)


def test_demo_endpoints_are_disabled_by_default_in_production():
    with TemporaryDirectory() as temp_dir:
        database_path = Path(temp_dir) / "test.db"
        settings = Settings(
            app_env="production",
            database_url=f"sqlite+pysqlite:///{database_path}",
            auto_seed=False,
            enqueue_webhooks=False,
            demo_secret="test-secret",
        )

        with _client_for(settings) as client:
            reset_response = client.post("/demo/reset", headers={"X-DEMO-SECRET": "test-secret"})
            stats_response = client.get("/demo/stats")

    assert reset_response.status_code == 404
    assert reset_response.json()["detail"]["code"] == "DEMO_ENDPOINTS_DISABLED"
    assert stats_response.status_code == 404
    assert stats_response.json()["detail"]["code"] == "DEMO_ENDPOINTS_DISABLED"


def test_demo_endpoints_can_be_explicitly_enabled_in_production():
    with TemporaryDirectory() as temp_dir:
        database_path = Path(temp_dir) / "test.db"
        settings = Settings(
            app_env="production",
            database_url=f"sqlite+pysqlite:///{database_path}",
            auto_seed=False,
            enqueue_webhooks=False,
            demo_endpoints_enabled=True,
            demo_secret="test-secret",
        )

        with _client_for(settings) as client:
            response = client.post("/demo/reset", headers={"X-DEMO-SECRET": "wrong-secret"})

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "UNAUTHORIZED"
