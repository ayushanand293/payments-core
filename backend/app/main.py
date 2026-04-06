from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.accounts import router as accounts_router
from app.api.routes.currencies import router as currencies_router
from app.api.routes.demo import router as demo_router
from app.api.routes.health import router as health_router
from app.api.routes.metrics import router as metrics_router
from app.api.routes.transactions import router as transactions_router
from app.api.routes.transfers import router as transfers_router
from app.core.config import Settings, get_settings
from app.core.db import create_engine_and_session
from app.core.logging import configure_logging
from app.core.metrics import HTTP_REQUESTS
from app.seed import seed_demo_data


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()

    engine, session_factory = create_engine_and_session(settings.database_url)

    app = FastAPI(title=settings.app_name)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def record_http_metrics(request: Request, call_next):
        response = await call_next(request)
        route = request.scope.get("route")
        route_path = route.path if route is not None else request.url.path
        HTTP_REQUESTS.labels(request.method, route_path, str(response.status_code)).inc()
        return response

    @app.on_event("startup")
    def on_startup() -> None:
        if settings.auto_seed:
            with session_factory() as session:
                seed_demo_data(session)

    app.include_router(health_router)
    app.include_router(accounts_router)
    app.include_router(currencies_router)
    app.include_router(transfers_router)
    app.include_router(transactions_router)
    app.include_router(demo_router)
    app.include_router(metrics_router)

    return app


app = create_app()
