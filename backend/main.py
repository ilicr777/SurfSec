import logging
import os
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, field_validator

from scanner import DomainEnricher, ScanReport

# ──────────────────────────────────────────────────────────
# Internal pre-shared secret (must match Next.js gateway)
# ──────────────────────────────────────────────────────────

INTERNAL_API_SECRET: str = os.getenv(
    "INTERNAL_API_SECRET", "surfsec_internal_secret_dev"
)

# ──────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────
# Shared httpx client (connection pool lives with the app)
# ──────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create and tear down the shared httpx client on app startup/shutdown."""
    timeout = httpx.Timeout(connect=5.0, read=5.0, write=5.0, pool=5.0)
    limits = httpx.Limits(max_connections=50, max_keepalive_connections=20)
    app.state.http_client = httpx.AsyncClient(timeout=timeout, limits=limits)
    logger.info("httpx AsyncClient initialised.")
    yield
    await app.state.http_client.aclose()
    logger.info("httpx AsyncClient closed.")


# ──────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────

app = FastAPI(
    title="SurfSec API",
    description="Async domain enrichment engine — DNS · Shodan · CVE",
    version="0.1.0",
    lifespan=lifespan,
)

# ──────────────────────────────────────────────────────────
# Request model
# ──────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    domains: list[str]

    @field_validator("domains")
    @classmethod
    def validate_domains(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("domains list must not be empty")
        if len(v) > 50:
            raise ValueError("Cannot scan more than 50 domains per request")
        cleaned = [d.strip().lower() for d in v if d.strip()]
        if not cleaned:
            raise ValueError("No valid domains provided")
        return cleaned


# ──────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────

@app.get("/health", tags=["Meta"])
async def health_check():
    return {"status": "ok"}


@app.post("/scan", response_model=ScanReport, tags=["Scanner"])
async def scan_domains(
    body: ScanRequest,
    x_internal_secret: Annotated[str | None, Header()] = None,
) -> ScanReport:
    """
    Accepts a list of domains and returns a full enriched report:
    DNS records, open ports (via Shodan), and mapped CVEs.

    Protected: requires X-Internal-Secret header matching the
    pre-shared secret configured between Next.js and FastAPI.
    """
    if x_internal_secret != INTERNAL_API_SECRET:
        raise HTTPException(
            status_code=403,
            detail="Forbidden — invalid or missing internal secret.",
        )

    enricher = DomainEnricher(app.state.http_client)
    try:
        report = await enricher.scan(body.domains)
    except Exception as exc:
        logger.exception("Unhandled scan error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return report
