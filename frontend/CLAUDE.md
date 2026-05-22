# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# PROJECT CONTEXT
Nexus is a B2B lead generation micro‑SaaS that automates attack surface and tech‑stack enrichment. It scans domain lists, correlates open ports/banners with CVEs, fetches decision‑maker emails via OSINT/Hunter.io, and drafts hyper‑personalized technical cold emails.

# TECH STACK
- **Frontend:** Next.js (App Router, TypeScript), Tailwind CSS, NextAuth.js (Credentials Provider with bcrypt), Prisma ORM.
- **Backend:** Python (FastAPI), httpx (async requests), Pydantic.
- **Infrastructure:** Docker (multi‑stage), PostgreSQL.

# CORE SYSTEM RULES & BOUNDARIES
1. **Business Logic Overkill:** Do not write B2C features. Focus strictly on B2B tenancy (Agencies), high‑margin scalability, and API optimisation.
2. **Transaction Safety:** Any action consuming credits (e.g., initiating a scan) MUST use atomic Prisma `$transaction` blocks to prevent race conditions.
3. **Fail‑Fast & Error Handling:** Never swallow errors. Backend network calls must have strict timeouts and exponential back‑off. Frontend API routes must return clean JSON error messages without leaking stack traces.
4. **Security First:** Passwords must be hashed via bcrypt. All internal backend routes must be shielded from public access.

# ESSENTIAL COMMANDS
- **Frontend Development:** `cd frontend && npm run dev` (or `yarn dev`, `pnpm dev`, `bun dev`)
- **Database Sync:** `cd frontend && npx prisma db push`
- **Backend Boot:** `docker-compose up -d --build`
- **Backend Logs:** `docker logs surfsec-backend-1 -f`
- **Run Tests (frontend):** `cd frontend && npm test`
- **Run Tests (backend):** Execute inside the Docker container or run `pytest` in the backend virtual environment.

# ARCHITECTURE OVERVIEW
- **Frontend** operates as a Next.js App Router application. It uses Tailwind for styling and NextAuth for authentication, persisting user sessions via bcrypt‑hashed passwords. Data fetching is performed through API routes that call the FastAPI backend.
- **Backend** is a FastAPI service exposing REST endpoints. It leverages httpx for async external requests (e.g., OSINT services) and Pydantic for request/response validation. Database interactions are handled via Prisma ORM with strict transaction boundaries.
- **Database** is PostgreSQL, managed through Prisma schema migrations. The schema is synchronised with `npx prisma db push`.
- **Containerisation**: Docker Compose defines three services – `frontend`, `backend`, and `db`. The backend runs inside a container built from the Python codebase; the frontend is built and served via Node.
- **Security posture**: All passwords are bcrypt‑hashed. Backend routes are protected behind authentication middleware. Network calls have timeouts and exponential back‑off. Errors are surfaced as sanitized JSON objects.

# AGENT BEHAVIOR
Act as a Lead Backend Engineer and Security Expert. Prioritise code efficiency and architectural resilience over UI embellishments. Do not alter Docker configurations unless explicitly requested. Always verify `.env` variables before executing integration tests.
