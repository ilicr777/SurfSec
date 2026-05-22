"""
scanner.py — Async Domain Enrichment Engine for SurfSec

Architecture notes:
- All I/O is driven by asyncio; DNS lookups run in a thread pool via
  loop.run_in_executor to avoid blocking the event loop (dnspython's
  resolver is synchronous).
- A single shared httpx.AsyncClient (with connection pooling) is injected
  into DomainEnricher at construction time and closed by the caller, which
  prevents file-descriptor leaks across concurrent scans.
- Exponential back-off + jitter is handled by tenacity so the retry logic is
  composable and testable in isolation.
- Every per-domain coroutine is wrapped with asyncio.wait_for (5 s) so a
  slow/unresponsive upstream never blocks the whole pipeline.
- asyncio.gather(..., return_exceptions=True) is used deliberately:
  individual domain failures are captured as exceptions in the result list
  rather than cancelling the whole batch.
"""

from __future__ import annotations

import asyncio
import functools
import logging
import os
import random
from datetime import datetime, timezone
from typing import Optional

import dns.resolver
import httpx
from pydantic import BaseModel, Field
from tenacity import (
    RetryError,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────

SHODAN_API_KEY: str = os.getenv("SHODAN_API_KEY", "")
SHODAN_BASE_URL: str = "https://api.shodan.io"
CVE_BASE_URL: str = "https://cve.circl.lu/api"   # circl.lu public CVE mirror
HUNTER_API_KEY: str = os.getenv("HUNTER_API_KEY", "")
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")

API_TIMEOUT_SECONDS: float = 5.0
MAX_CONCURRENT_DOMAINS: int = int(os.getenv("MAX_CONCURRENT_DOMAINS", "10"))

# ──────────────────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────────────────

class DnsInfo(BaseModel):
    a_records: list[str] = Field(default_factory=list)
    mx_records: list[str] = Field(default_factory=list)
    txt_records: list[str] = Field(default_factory=list)
    error: Optional[str] = None


class PortInfo(BaseModel):
    port: int
    protocol: str = "tcp"
    banner: Optional[str] = None
    transport: Optional[str] = None


class ShodanInfo(BaseModel):
    ip: Optional[str] = None
    country: Optional[str] = None
    org: Optional[str] = None
    open_ports: list[PortInfo] = Field(default_factory=list)
    error: Optional[str] = None


class CveEntry(BaseModel):
    cve_id: str
    cvss: Optional[float] = None
    summary: str
    severity: str  # "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE"
    source_banner: str


class CveInfo(BaseModel):
    entries: list[CveEntry] = Field(default_factory=list)
    error: Optional[str] = None


class EnrichedDomainReport(BaseModel):
    domain: str
    scanned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    dns: DnsInfo
    shodan: ShodanInfo
    cve: CveInfo
    emails: list[str] = Field(default_factory=list)
    cold_email_template: Optional[str] = None

    @property
    def critical_cve_count(self) -> int:
        return sum(1 for c in self.cve.entries if c.severity == "CRITICAL")


class ScanReport(BaseModel):
    """Top-level response envelope for a batch scan."""
    total: int
    successful: int
    failed: int
    results: list[EnrichedDomainReport]
    errors: dict[str, str] = Field(default_factory=dict)


# ──────────────────────────────────────────────────────────
# Retry helpers
# ──────────────────────────────────────────────────────────

class RateLimitError(Exception):
    """Raised when an upstream API returns HTTP 429."""


def _make_retry(**extra):
    """Factory for a tenacity retry decorator targeting rate-limit responses."""
    return retry(
        retry=retry_if_exception_type(RateLimitError),
        wait=wait_exponential_jitter(initial=1, max=30, jitter=2),
        stop=stop_after_attempt(4),
        reraise=True,
        **extra,
    )


# ──────────────────────────────────────────────────────────
# DNS Resolver (thread-pool offload)
# ──────────────────────────────────────────────────────────

def _resolve_sync(domain: str) -> DnsInfo:
    """
    Synchronous DNS resolution — meant to run inside run_in_executor.
    Queries A, MX and TXT records.
    """
    resolver = dns.resolver.Resolver()
    resolver.lifetime = 4.0   # hard wall per query set

    result = DnsInfo()

    for rtype, field in [("A", "a_records"), ("MX", "mx_records"), ("TXT", "txt_records")]:
        try:
            answers = resolver.resolve(domain, rtype)
            if rtype == "MX":
                records = [str(r.exchange).rstrip(".") for r in answers]
            elif rtype == "TXT":
                records = [b"".join(r.strings).decode(errors="replace") for r in answers]
            else:
                records = [r.address for r in answers]
            setattr(result, field, records)
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            pass
        except Exception as exc:
            result.error = str(exc)
            break

    return result


async def _resolve_dns(domain: str, loop: asyncio.AbstractEventLoop) -> DnsInfo:
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, functools.partial(_resolve_sync, domain)),
            timeout=API_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        return DnsInfo(error="DNS resolution timed out after 5 s")
    except Exception as exc:
        return DnsInfo(error=str(exc))


# ──────────────────────────────────────────────────────────
# Shodan Enrichment
# ──────────────────────────────────────────────────────────

async def _fetch_shodan_raw(client: httpx.AsyncClient, ip: str) -> dict:
    """Inner call; raises RateLimitError on 429 so tenacity can retry."""
    if not SHODAN_API_KEY:
        # Offline simulation — return plausible mock data
        logger.warning("SHODAN_API_KEY not set, returning simulated Shodan data.")
        await asyncio.sleep(random.uniform(0.05, 0.2))   # simulate network latency
        return _mock_shodan_response(ip)

    url = f"{SHODAN_BASE_URL}/shodan/host/{ip}"
    response = await client.get(url, params={"key": SHODAN_API_KEY})

    if response.status_code == 429:
        raise RateLimitError(f"Shodan rate-limited: {response.text[:120]}")
    if response.status_code == 404:
        return {}
    response.raise_for_status()
    return response.json()


def _mock_shodan_response(ip: str) -> dict:
    """
    Deterministic mock so unit tests can run without a live Shodan key.
    The banner strings are intentionally realistic for CVE-mapping tests.
    """
    return {
        "ip_str": ip,
        "country_name": "Italy",
        "org": "Telecom Italia S.p.A.",
        "data": [
            {"port": 80, "transport": "tcp", "banner": "Apache httpd 2.4.49"},
            {"port": 443, "transport": "tcp", "banner": "nginx/1.14.0"},
            {"port": 22, "transport": "tcp", "banner": "OpenSSH 7.2p2 Ubuntu"},
        ],
    }


@_make_retry()
async def _fetch_shodan_with_retry(client: httpx.AsyncClient, ip: str) -> dict:
    return await _fetch_shodan_raw(client, ip)


async def _enrich_shodan(
    client: httpx.AsyncClient,
    domain: str,
    dns_info: DnsInfo,
) -> ShodanInfo:
    """
    Resolves domain → IP (from dns_info) then queries Shodan.
    Falls back gracefully if no A record exists or the call times out.
    """
    ip = dns_info.a_records[0] if dns_info.a_records else None
    if not ip:
        return ShodanInfo(error="No A record to query")

    try:
        raw = await asyncio.wait_for(
            _fetch_shodan_with_retry(client, ip),
            timeout=API_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        return ShodanInfo(error="Shodan call timed out after 5 s")
    except RetryError as exc:
        return ShodanInfo(error=f"Shodan rate-limit retries exhausted: {exc}")
    except Exception as exc:
        return ShodanInfo(error=str(exc))

    if not raw:
        return ShodanInfo(ip=ip)

    ports = [
        PortInfo(
            port=item["port"],
            protocol="tcp",
            banner=item.get("banner"),
            transport=item.get("transport"),
        )
        for item in raw.get("data", [])
    ]
    return ShodanInfo(
        ip=raw.get("ip_str", ip),
        country=raw.get("country_name"),
        org=raw.get("org"),
        open_ports=ports,
    )


# ──────────────────────────────────────────────────────────
# CVE Enrichment
# ──────────────────────────────────────────────────────────

_SEVERITY_MAP = {
    (9.0, 10.0): "CRITICAL",
    (7.0,  8.9): "HIGH",
    (4.0,  6.9): "MEDIUM",
    (0.1,  3.9): "LOW",
}

def _cvss_to_severity(score: Optional[float]) -> str:
    if score is None:
        return "NONE"
    for (lo, hi), label in _SEVERITY_MAP.items():
        if lo <= score <= hi:
            return label
    return "NONE"


async def _fetch_cve_for_banner_raw(client: httpx.AsyncClient, banner: str) -> list[dict]:
    """
    Queries circl.lu CVE API for product/version strings extracted from
    the banner.  Raises RateLimitError on 429.
    """
    # Extract first token as a product hint (e.g. "Apache" from "Apache httpd 2.4.49")
    product = banner.split()[0].lower().replace("/", " ")

    try:
        response = await client.get(
            f"{CVE_BASE_URL}/search/{product}",
            timeout=API_TIMEOUT_SECONDS,
        )
    except httpx.TimeoutException:
        raise asyncio.TimeoutError("CVE API timeout")

    if response.status_code == 429:
        raise RateLimitError(f"CVE API rate-limited for banner '{banner[:60]}'")
    if response.status_code in (404, 422):
        return []
    response.raise_for_status()

    data = response.json()
    # circl.lu returns a list of CVE dicts directly
    return data if isinstance(data, list) else []


@_make_retry()
async def _fetch_cve_with_retry(client: httpx.AsyncClient, banner: str) -> list[dict]:
    return await _fetch_cve_for_banner_raw(client, banner)


def _mock_cve_for_banner(banner: str) -> list[dict]:
    """Offline mock aligned to the Shodan mock banners."""
    _mock_db: dict[str, list[dict]] = {
        "apache": [
            {"id": "CVE-2021-41773", "cvss": 9.8, "summary": "Path traversal and RCE in Apache 2.4.49"},
            {"id": "CVE-2021-42013", "cvss": 9.8, "summary": "Path traversal bypass in Apache 2.4.49/2.4.50"},
        ],
        "nginx": [
            {"id": "CVE-2021-23017", "cvss": 7.7, "summary": "Off-by-one in nginx resolver (1.14)"},
        ],
        "openssh": [
            {"id": "CVE-2016-6515", "cvss": 7.8, "summary": "DoS via crafted password in OpenSSH 7.x"},
        ],
    }
    key = banner.split()[0].lower()
    return _mock_db.get(key, [])


async def _enrich_cve(
    client: httpx.AsyncClient,
    shodan_info: ShodanInfo,
) -> CveInfo:
    """
    For each open port banner, queries the CVE database concurrently.
    Results are deduplicated by CVE ID.
    """
    banners: list[str] = [
        p.banner for p in shodan_info.open_ports if p.banner
    ]
    if not banners:
        return CveInfo()

    async def _per_banner(banner: str) -> tuple[str, list[dict]]:
        try:
            if not SHODAN_API_KEY:
                # also mock CVE when offline
                await asyncio.sleep(random.uniform(0.02, 0.1))
                return banner, _mock_cve_for_banner(banner)
            raw = await asyncio.wait_for(
                _fetch_cve_with_retry(client, banner),
                timeout=API_TIMEOUT_SECONDS,
            )
            return banner, raw
        except asyncio.TimeoutError:
            logger.warning("CVE lookup timed out for banner: %s", banner)
            return banner, []
        except RetryError as exc:
            logger.warning("CVE rate-limit retries exhausted for %s: %s", banner, exc)
            return banner, []
        except Exception as exc:
            logger.error("CVE lookup error for %s: %s", banner, exc)
            return banner, []

    # Run all banner lookups concurrently; cap with a semaphore to avoid
    # overwhelming the upstream at high cardinality
    sem = asyncio.Semaphore(5)

    async def _guarded(banner: str):
        async with sem:
            return await _per_banner(banner)

    tasks = [asyncio.create_task(_guarded(b)) for b in banners]
    raw_results: list[tuple[str, list[dict]]] = await asyncio.gather(*tasks, return_exceptions=False)

    seen_ids: set[str] = set()
    entries: list[CveEntry] = []
    for source_banner, cve_list in raw_results:
        for raw_cve in cve_list[:20]:  # cap per-banner to prevent bloat
            cve_id = raw_cve.get("id") or raw_cve.get("cve_id", "")
            if not cve_id or cve_id in seen_ids:
                continue
            seen_ids.add(cve_id)
            score = raw_cve.get("cvss") or raw_cve.get("cvss3")
            entries.append(
                CveEntry(
                    cve_id=cve_id,
                    cvss=float(score) if score else None,
                    summary=raw_cve.get("summary", "No summary available"),
                    severity=_cvss_to_severity(float(score) if score else None),
                    source_banner=source_banner,
                )
            )

    # Sort descending by CVSS so the most critical bubbles to the top
    entries.sort(key=lambda e: e.cvss or 0.0, reverse=True)
    return CveInfo(entries=entries)


# ──────────────────────────────────────────────────────────
# Hunter Enrichment
# ──────────────────────────────────────────────────────────

async def _enrich_hunter(client: httpx.AsyncClient, domain: str) -> list[str]:
    """Extracts up to 3 emails for the given domain via Hunter.io API."""
    if not HUNTER_API_KEY:
        logger.warning("HUNTER_API_KEY not set, using mock data.")
        await asyncio.sleep(random.uniform(0.05, 0.2))
        return [f"contact@{domain}", f"admin@{domain}"]

    url = "https://api.hunter.io/v2/domain-search"
    try:
        response = await asyncio.wait_for(
            client.get(url, params={"domain": domain, "api_key": HUNTER_API_KEY, "limit": 3}),
            timeout=API_TIMEOUT_SECONDS,
        )
        if response.status_code == 429:
            logger.warning("Hunter API rate limited")
            return []
        response.raise_for_status()
        data = response.json().get("data", {})
        emails = data.get("emails", [])
        return [e.get("value") for e in emails if e.get("value")][:3]
    except Exception as exc:
        logger.error("Hunter API error for %s: %s", domain, exc)
        return []


# ──────────────────────────────────────────────────────────
# LLM Email Template Generation (OpenAI)
# ──────────────────────────────────────────────────────────

async def _generate_cold_email(
    client: httpx.AsyncClient, domain: str, shodan: ShodanInfo, cve: CveInfo
) -> str | None:
    """Generates a highly technical B2B cold email using OpenAI."""
    if not OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY not set, using mock email template.")
        await asyncio.sleep(random.uniform(0.2, 0.5))
        return f"Mock Template: Hi team at {domain}, we found {len(cve.entries)} vulnerabilities..."

    critical_vulns = [c.cve_id for c in cve.entries if c.severity == "CRITICAL"]
    ports = [p.port for p in shodan.open_ports]
    
    sys_prompt = (
        "You are an elite offensive security engineer and B2B salesperson. "
        "Your goal is to write a concise, highly technical cold email to the IT leadership "
        "of a target company. You will be provided with technical findings. "
        "Do NOT use generic marketing fluff. Focus on the actual risks (e.g. specific CVEs, open ports) "
        "and offer a brief consultation to secure their infrastructure. "
        "The email must be ready to send."
    )
    
    user_prompt = (
        f"Target Domain: {domain}\n"
        f"Open Ports: {ports}\n"
        f"Critical CVEs: {critical_vulns[:5]}\n"
        "Generate the email body."
    )

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 300
    }

    try:
        response = await asyncio.wait_for(
            client.post(url, headers=headers, json=payload),
            timeout=10.0, # LLMs can be slow
        )
        if response.status_code == 429:
            logger.warning("OpenAI rate limited")
            return None
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.error("OpenAI API error for %s: %s", domain, exc)
        return None


# ──────────────────────────────────────────────────────────
# DomainEnricher — public interface
# ──────────────────────────────────────────────────────────

class DomainEnricher:
    """
    Orchestrates concurrent async enrichment for a list of domains.

    Usage (lifecycle managed by the caller — no internal client creation):

        async with httpx.AsyncClient(timeout=5) as client:
            enricher = DomainEnricher(client)
            report = await enricher.scan(["example.com", "test.local"])

    This avoids resource leaks: the client, its connection pool, and the
    underlying TCP sockets are all closed deterministically by the `async with`
    block even if an exception is raised mid-scan.
    """

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client
        self._loop = asyncio.get_event_loop()

    async def _enrich_single(self, domain: str) -> EnrichedDomainReport:
        """
        Full enrichment pipeline for one domain.
        DNS → Shodan → CVE (each step may depend on the previous one's result).
        """
        logger.info("[%s] Starting enrichment", domain)

        dns_info = await _resolve_dns(domain, self._loop)
        logger.debug("[%s] DNS: %s", domain, dns_info)

        shodan_info = await _enrich_shodan(self._client, domain, dns_info)
        logger.debug("[%s] Shodan: %s", domain, shodan_info)

        cve_info = await _enrich_cve(self._client, shodan_info)
        logger.debug("[%s] CVE entries: %d", domain, len(cve_info.entries))

        emails = await _enrich_hunter(self._client, domain)
        logger.debug("[%s] Hunter emails found: %d", domain, len(emails))

        cold_email = await _generate_cold_email(self._client, domain, shodan_info, cve_info)
        logger.debug("[%s] LLM template generated: %s", domain, bool(cold_email))

        return EnrichedDomainReport(
            domain=domain,
            dns=dns_info,
            shodan=shodan_info,
            cve=cve_info,
            emails=emails,
            cold_email_template=cold_email,
        )

    async def scan(self, domains: list[str]) -> ScanReport:
        """
        Scans all domains concurrently, bounded by MAX_CONCURRENT_DOMAINS.

        Memory safety:
        - Tasks are collected in a list and awaited via gather(return_exceptions=True).
          Orphaned tasks cannot survive past this call.
        - The semaphore prevents N unbounded coroutines from holding live
          httpx connections simultaneously.
        - DNS executor futures are bounded by the thread pool default (min(32, cpu+4)).
        """
        sem = asyncio.Semaphore(MAX_CONCURRENT_DOMAINS)

        async def _bounded(domain: str):
            async with sem:
                return await self._enrich_single(domain)

        raw: list[EnrichedDomainReport | BaseException] = await asyncio.gather(
            *[asyncio.create_task(_bounded(d)) for d in domains],
            return_exceptions=True,
        )

        results: list[EnrichedDomainReport] = []
        errors: dict[str, str] = {}

        for domain, outcome in zip(domains, raw):
            if isinstance(outcome, BaseException):
                logger.error("[%s] Enrichment failed: %s", domain, outcome)
                errors[domain] = str(outcome)
            else:
                results.append(outcome)

        return ScanReport(
            total=len(domains),
            successful=len(results),
            failed=len(errors),
            results=results,
            errors=errors,
        )
