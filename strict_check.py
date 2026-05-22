import subprocess
import sys
import os
import urllib.request
import urllib.error

def run_cmd(cmd, cwd=None, error_msg=None):
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            shell=True,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"FAILED: {error_msg if error_msg else f'Command failed with exit code {e.returncode}'}", file=sys.stderr)
        print("--- STDOUT ---", file=sys.stderr)
        print(e.stdout, file=sys.stderr)
        print("--- STDERR ---", file=sys.stderr)
        print(e.stderr, file=sys.stderr)
        sys.exit(1)

def main():
    root_dir = r"c:\Users\cyber\Desktop\SurfSec"
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")

    # Step 1: docker info
    run_cmd("docker info", cwd=root_dir, error_msg="Il demone Docker non è raggiungibile.")

    # Step 2: verify /backend/.env
    env_path = os.path.join(backend_dir, ".env")
    if not os.path.exists(env_path):
        print("FAILED: /backend/.env non trovato. Rinomina .env.example e inserisci le chiavi.", file=sys.stderr)
        sys.exit(1)
        
    with open(env_path, "r", encoding="utf-8") as f:
        env_content = f.read()
        
    openai_key_found = False
    for line in env_content.splitlines():
        if line.startswith("OPENAI_API_KEY="):
            val = line.split("=", 1)[1].strip()
            if val:
                openai_key_found = True
            break
            
    if not openai_key_found:
        print("FAILED: OPENAI_API_KEY è vuota o mancante nel file /backend/.env", file=sys.stderr)
        sys.exit(1)

    # Step 3: docker-compose up -d --build
    run_cmd("docker-compose up -d --build", cwd=root_dir, error_msg="Fallita l'esecuzione di docker-compose up -d --build")

    # Step 4: docker ps status verification
    docker_ps_out = run_cmd("docker ps", cwd=root_dir, error_msg="Fallita l'esecuzione di docker ps")
    
    backend_up = False
    db_up = False
    for line in docker_ps_out.splitlines():
        if "surfsec-backend" in line or "backend" in line:
            if "Up " in line and "Exited" not in line and "Restarting" not in line:
                backend_up = True
        if "surfsec-db" in line or "postgres" in line:
            if "Up " in line and "Exited" not in line and "Restarting" not in line:
                db_up = True

    if not (backend_up and db_up):
        print("FAILED: I container FastAPI e PostgreSQL non sono nello stato 'Up' corretto.", file=sys.stderr)
        print("--- DOCKER PS OUTPUT ---", file=sys.stderr)
        print(docker_ps_out, file=sys.stderr)
        sys.exit(1)

    # Step 5: npx prisma db push
    run_cmd("npx prisma db push", cwd=frontend_dir, error_msg="Fallita l'esecuzione di npx prisma db push")

    # Step 6: HTTP GET health check
    health_url = "http://localhost:8000/health"
    try:
        req = urllib.request.Request(health_url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.getcode()
            print(f"Health check status code: {status_code}")
    except urllib.error.URLError as e:
        print(f"FAILED: Chiamata health check fallita. Motivo: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"FAILED: Errore imprevisto durante health check: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
