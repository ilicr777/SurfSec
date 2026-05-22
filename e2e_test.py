import httpx
import sys
import json

def run_test():
    url = "http://localhost:3000/api/scan"
    payload = {"domains": "scanme.nmap.org"}
    
    print(f"Sending POST to {url} with payload {payload}")
    try:
        response = httpx.post(url, json=payload, timeout=30.0)
        print(f"Status Code: {response.status_code}")
        
        try:
            data = response.json()
            print("Response JSON:")
            print(json.dumps(data, indent=2))
        except BaseException as e:
            print("Failed to decode JSON. Raw response:")
            print(response.text)
            sys.exit(1)
            
        if response.status_code == 200 and "results" in data:
            print("API Test PASSED")
            sys.exit(0)
        else:
            print("API Test FAILED")
            sys.exit(1)
            
    except Exception as e:
        print(f"Error during API call: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_test()
