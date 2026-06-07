# SurfSec SaaS VPS Production Deployment Guide

This guide describes how to deploy the SurfSec production stack on a Linux VPS (e.g. Hetzner, DigitalOcean, AWS, Linode) running Ubuntu/Debian. It features complete database hardening, an Nginx reverse proxy, and automated SSL certificate provisioning.

---

## 1. VPS Prerequisites

Login to your VPS via SSH and install Docker + Docker Compose:

```bash
# Update package list
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose (if not bundled)
sudo apt-get install -y docker-compose-plugin

# Verify installations
docker --version
docker compose version
```

Make sure your domain name (e.g., `surfsec.example.com`) is correctly mapped to your VPS IP address via an **A Record** in your DNS provider.

---

## 2. Configuration & Secrets Setup

Clone your repository to the VPS:
```bash
git clone <your-repo-url> /opt/surfsec
cd /opt/surfsec
```

Create a production environment file `.env` in the root folder of the project. This file will be read by Docker Compose:

```bash
cat << 'EOF' > .env
# Database Credentials
DB_PASSWORD=YOUR_SECURE_RANDOM_PASSWORD_HERE

# SaaS & Auth Configuration
NEXTAUTH_URL=https://surfsec.example.com
NEXTAUTH_SECRET=GENERATE_A_RANDOM_BASE64_KEY_HERE
INTERNAL_API_SECRET=CHOOSE_A_SECURE_PRE_SHARED_SECRET_KEY

# Third-Party APIs Keys
SHODAN_API_KEY=your_production_shodan_key
HUNTER_API_KEY=your_production_hunter_key
OPENAI_API_KEY=sk-proj-production_openai_key
OPENAI_MODEL=gpt-4o
MAX_CONCURRENT_DOMAINS=15

# Stripe Billing Settings
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
EOF
```

> [!TIP]
> You can generate a secure Base64 secret for `NEXTAUTH_SECRET` by running: `openssl rand -base64 32`

---

## 3. Resolving the Nginx & SSL Chicken-and-Egg Problem

Nginx will fail to start if the SSL certificates mapped in `nginx/conf.d/app.conf` do not exist. To solve this startup problem, we will temporarily run Certbot in `standalone` mode to fetch the initial certificate **before** starting Nginx.

### Step 3.1: Edit Nginx Configuration
Open `/opt/surfsec/nginx/conf.d/app.conf` and replace **all** occurrences of `YOUR_DOMAIN_HERE` with your actual domain (e.g., `surfsec.example.com`). Also update the custom header `surfsec_internal_secret_prod_REPLACE_ME` with your `INTERNAL_API_SECRET` for backend proxying protection.

### Step 3.2: Obtain the Let's Encrypt Certificate
Run a standalone Certbot Docker container to fetch the certificate. Make sure ports 80 and 443 are not occupied by any process before running this command:

```bash
docker run -it --rm \
  -p 80:80 \
  -v "/opt/surfsec/nginx/certbot/conf:/etc/letsencrypt" \
  -v "/opt/surfsec/nginx/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --standalone \
  -d surfsec.example.com \
  --email admin@example.com \
  --agree-tos --no-eff-email
```

Once successful, Certbot will generate your keys under `/opt/surfsec/nginx/certbot/conf/live/surfsec.example.com/`.

---

## 4. Bootstrapping the Services

Now you are ready to launch the entire stack!

```bash
# Build and run the containers in detached (background) mode
docker compose -f docker-compose.prod.yml up -d --build
```

### Step 4.1: Run Database Schema Migrations
Once the containers are up, execute the Prisma migration/push on the database container to create the tables:

```bash
docker compose -f docker-compose.prod.yml exec frontend npx prisma db push
```

---

## 5. Maintenance & Monitoring Commands

Use these commands to manage your running production stack:

### Check Logs in Real-time
```bash
docker compose -f docker-compose.prod.yml logs -f
```

### View Logs for a Specific Service
```bash
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f backend
```

### Stop the Production Stack
```bash
docker compose -f docker-compose.prod.yml down
```

### View Resource Consumption
```bash
docker stats
```

---

## 6. Security Hardening Checklist

- [x] **PostgreSQL Port 5432 Isolated**: Accessible only via the internal Docker bridge network.
- [x] **FastAPI Port 8000 Isolated**: Blocked from public connections; only reachable via Nginx or secure internal queries.
- [x] **Non-Root Processes**: Both python and nextjs run under non-root system users (`appuser` / `nextjs`).
- [x] **Secure SSL Ciphers & TLS 1.3**: Applied standard modern cryptographic protocol constraints in Nginx.
- [x] **Auto Certificate Renewal**: The `certbot` container checks for renewals every 12 hours automatically.
