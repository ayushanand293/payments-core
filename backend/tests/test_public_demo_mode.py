from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.db import Base
from app.main import create_app
from app.seed import seed_demo_data


def _client_for(settings: Settings):
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    with app.state.session_factory() as session:
        seed_demo_data(session)
    return TestClient(app)


def test_public_demo_capabilities_and_read_endpoints_are_available():
    with TemporaryDirectory() as temp_dir:
        database_path = Path(temp_dir) / "test.db"
        settings = Settings(
            database_url=f"sqlite+pysqlite:///{database_path}",
            auto_seed=False,
            public_demo=True,
            enqueue_webhooks=False,
        )

        with _client_for(settings) as client:
            capabilities = client.get("/capabilities")
            stats = client.get("/stats")
            accounts = client.get("/accounts")

    assert capabilities.status_code == 200
    assert capabilities.json()["read_only"] is True
    assert capabilities.json()["writes_enabled"] is False
    assert stats.status_code == 200
    assert accounts.status_code == 200


def test_public_demo_blocks_mutating_control_plane_endpoints():
    with TemporaryDirectory() as temp_dir:
        database_path = Path(temp_dir) / "test.db"
        settings = Settings(
            database_url=f"sqlite+pysqlite:///{database_path}",
            auto_seed=False,
            public_demo=True,
            enqueue_webhooks=False,
        )

        with _client_for(settings) as client:
            accounts = client.get("/accounts").json()
            source = next(account for account in accounts if account["name"] == "INR Alice Wallet")
            destination = next(account for account in accounts if account["name"] == "INR Corner Shop")

            responses = [
                client.post("/accounts", json={"name": "Blocked", "currency_code": "INR", "type": "USER"}),
                client.post(
                    "/transfers",
                    json={
                        "from_account_id": source["id"],
                        "to_account_id": destination["id"],
                        "currency_code": "INR",
                        "amount_minor": 1,
                    },
                    headers={"Idempotency-Key": "blocked-transfer"},
                ),
                client.post(
                    "/holds/authorize",
                    json={"account_id": source["id"], "currency_code": "INR", "amount_minor": 1},
                    headers={"Idempotency-Key": "blocked-hold"},
                ),
                client.post(
                    "/webhooks/gateway",
                    json={
                        "event_id": "blocked",
                        "event_type": "demo.fund",
                        "payload": {"account_id": source["id"], "currency_code": "INR", "amount_minor": 1},
                    },
                ),
                client.post("/reconcile/run"),
                client.post("/demo/reset", headers={"X-DEMO-SECRET": "change-me"}),
            ]

    for response in responses:
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "PUBLIC_DEMO_READ_ONLY"
