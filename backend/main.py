import logging
import os
from contextlib import asynccontextmanager
from typing import Annotated

from dotenv import load_dotenv
load_dotenv()

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

import json
import asyncpg
from fastapi import BackgroundTasks

class ScanRequest(BaseModel):
    domains: list[str]
    report_id: str
    agency_id: str | None = None

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


async def get_db_connection():
    db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/surfsec?schema=public")
    if "?" in db_url:
        db_url = db_url.split("?")[0]
    return await asyncpg.connect(db_url)


async def process_scan_background(domains: list[str], report_id: str, agency_id: str | None, http_client):
    logger.info(f"Starting background scan for report {report_id} (agency: {agency_id})")
    
    # 1. Update status to PROCESSING
    try:
        conn = await get_db_connection()
        await conn.execute(
            'UPDATE "ScanReport" SET "status" = $1 WHERE "id" = $2',
            'PROCESSING',
            report_id
        )
        await conn.close()
    except Exception as exc:
        logger.error(f"Failed to update status to PROCESSING for report {report_id}: {exc}")
        
    enricher = DomainEnricher(http_client)
    try:
        report = await enricher.scan(domains)
        
        # Serialize results to JSON
        results_list = []
        for r in report.results:
            if hasattr(r, "model_dump"):
                results_list.append(r.model_dump(mode="json"))
            else:
                results_list.append(json.loads(r.json()))
                
        results_json = json.dumps(results_list)
        errors_json = json.dumps(report.errors)
        
        # Update ScanReport with results and set status to COMPLETED
        conn = await get_db_connection()
        await conn.execute(
            'UPDATE "ScanReport" SET "status" = $1, "total" = $2, "successful" = $3, "failed" = $4, "results" = $5::json, "errors" = $6::json WHERE "id" = $7',
            'COMPLETED',
            report.total,
            report.successful,
            report.failed,
            results_json,
            errors_json,
            report_id
        )
        await conn.close()
        logger.info(f"Successfully completed background scan for report {report_id}")
        
    except Exception as exc:
        logger.exception(f"Exception during background scan for report {report_id}")
        
        # Update status to FAILED
        try:
            conn = await get_db_connection()
            await conn.execute(
                'UPDATE "ScanReport" SET "status" = $1, "errors" = $2::json WHERE "id" = $3',
                'FAILED',
                json.dumps({"error": str(exc)}),
                report_id
            )
            
            # Atomic credit refund if agency_id is provided
            if agency_id:
                await conn.execute(
                    'UPDATE "Agency" SET "scan_credits" = "scan_credits" + 1, "updatedAt" = NOW() WHERE "id" = $1',
                    agency_id
                )
                logger.info(f"Successfully refunded credit to agency {agency_id} for failed scan {report_id}")
                
            await conn.close()
        except Exception as db_exc:
            logger.error(f"Failed to handle error state in DB for report {report_id}: {db_exc}")


@app.post("/scan", tags=["Scanner"])
async def scan_domains(
    body: ScanRequest,
    background_tasks: BackgroundTasks,
    x_internal_secret: Annotated[str | None, Header()] = None,
):
    """
    Accepts a list of domains and schedules a background scan job, returning immediately.
    """
    if x_internal_secret != INTERNAL_API_SECRET:
        raise HTTPException(
            status_code=403,
            detail="Forbidden — invalid or missing internal secret.",
        )

    background_tasks.add_task(
        process_scan_background,
        body.domains,
        body.report_id,
        body.agency_id,
        app.state.http_client
    )

    return {"status": "accepted", "report_id": body.report_id}
