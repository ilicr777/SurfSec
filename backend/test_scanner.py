import asyncio
import httpx
import pytest

from main import ScanRequest
from scanner import DomainEnricher

def test_scan_request_validation():
    # Test valid
    req = ScanRequest(domains=["example.com", " test.local "])
    assert req.domains == ["example.com", "test.local"]
    
    # Test empty
    with pytest.raises(ValueError, match="No valid domains provided"):
        ScanRequest(domains=["   ", ""])
        
    with pytest.raises(ValueError, match="domains list must not be empty"):
        ScanRequest(domains=[])
    
    # Test too many
    with pytest.raises(ValueError, match="Cannot scan more than 50 domains"):
        ScanRequest(domains=[f"dom{i}.com" for i in range(51)])

@pytest.mark.asyncio
async def test_enrich_timeout_fallback(monkeypatch):
    """
    Test that a slow Shodan HTTP call falls back correctly via the wait_for timeout,
    without crashing the entire pipeline.
    """
    # Mock environment to force network branch
    monkeypatch.setattr("scanner.SHODAN_API_KEY", "dummy_key")
    # Reduce timeout for test speed
    monkeypatch.setattr("scanner.API_TIMEOUT_SECONDS", 0.1)
    
    async with httpx.AsyncClient() as client:
        enricher = DomainEnricher(client)
        
        # Mock _fetch_shodan_raw to sleep longer than API_TIMEOUT_SECONDS
        async def mock_fetch_shodan_raw(*args, **kwargs):
            await asyncio.sleep(0.5)
            return {}
            
        monkeypatch.setattr("scanner._fetch_shodan_raw", mock_fetch_shodan_raw)
        
        # Mock DNS to return a fake IP quickly so it proceeds to Shodan
        from scanner import DnsInfo
        async def mock_dns(*args):
            return DnsInfo(a_records=["127.0.0.1"])
        monkeypatch.setattr("scanner._resolve_dns", mock_dns)
        
        report = await enricher._enrich_single("example.com")
        
        # Verify Shodan correctly caught the TimeoutError and set the error field
        assert report.shodan.error is not None
        assert "timed out" in report.shodan.error
