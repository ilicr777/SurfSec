import httpx
import sys
import os
import json
import time

TEST_BYPASS_SECRET = os.environ.get("TEST_BYPASS_SECRET", "surfsec_e2e_bypass_k7x9Q2m")
NEXTJS_BASE_URL = os.environ.get("NEXTJS_BASE_URL", "http://localhost:3000")

def run_test():
    url = f"{NEXTJS_BASE_URL}/api/scan"
    payload = {"domains": "scanme.nmap.org"}
    headers = {
        "Content-Type": "application/json",
        "X-Test-Bypass-Secret": TEST_BYPASS_SECRET,
    }

    print(f"Sending POST to {url}")
    print(f"Payload: {json.dumps(payload)}")
    print(f"Bypass header: X-Test-Bypass-Secret=***{TEST_BYPASS_SECRET[-4:]}")
    print("-" * 60)

    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=60.0)
        print(f"POST Status Code: {response.status_code}")

        try:
            data = response.json()
            print("POST Response JSON:")
            print(json.dumps(data, indent=2))
        except Exception:
            print("Failed to decode JSON. Raw response:")
            print(response.text)
            sys.exit(1)

        # Accept 202 as a valid response
        if response.status_code != 202 or "report" not in data:
            if response.status_code == 403:
                print("\nE2E TEST FAILED - Insufficient credits (403)")
                print("The test agency has 0 scan_credits. Reset credits in the DB.")
            else:
                print(f"\nE2E TEST FAILED - Unexpected POST status {response.status_code}")
            sys.exit(1)

        # Extract Report ID
        report_id = data["report"].get("id")
        remaining_credits = data.get("remaining_credits")
        print(f"Scan accepted with Report ID: {report_id}")
        print(f"Credits immediately remaining: {remaining_credits}")
        print("-" * 60)

        # Polling job status using a while loop
        status_url = f"{NEXTJS_BASE_URL}/api/scan/{report_id}/status"
        print(f"Polling status from {status_url} ...")
        
        attempts = 0
        max_attempts = 15
        while attempts < max_attempts:
            time.sleep(2.0)
            attempts += 1
            try:
                status_res = httpx.get(status_url, headers=headers, timeout=10.0)
                if status_res.status_code != 200:
                    print(f"Error polling status (HTTP {status_res.status_code}): {status_res.text}")
                    sys.exit(1)
                
                status_data = status_res.json()
                current_status = status_data.get("status")
                print(f"  [Attempt {attempts}/{max_attempts}] Status: {current_status}")

                if current_status == "COMPLETED":
                    print("\n" + "=" * 60)
                    print("E2E TEST PASSED")
                    print(f"  Report ID:         {status_data.get('id', 'N/A')}")
                    print(f"  Remaining Credits: {remaining_credits}")
                    print(f"  Domains Scanned:   {status_data.get('total', 'N/A')}")
                    print(f"  Successful:        {status_data.get('successful', 'N/A')}")
                    print(f"  Failed:            {status_data.get('failed', 'N/A')}")
                    print("Results Payload:")
                    print(json.dumps(status_data.get("results"), indent=2))
                    print("=" * 60)
                    sys.exit(0)
                elif current_status == "FAILED":
                    print(f"\nE2E TEST FAILED - Job failed. Errors: {status_data.get('errors')}")
                    sys.exit(1)
                    
            except Exception as e:
                print(f"Exception during polling: {e}")
                sys.exit(1)
                
        print("\nE2E TEST FAILED - Polling timed out")
        sys.exit(1)

    except httpx.TimeoutException:
        print("Error: Request timed out after 60s")
        sys.exit(1)
    except httpx.ConnectError:
        print(f"Error: Could not connect to {NEXTJS_BASE_URL}")
        print("Make sure both Next.js and the FastAPI backend are running.")
        sys.exit(1)
    except Exception as e:
        print(f"Error during API call: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_test()
