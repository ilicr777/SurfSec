import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

// ─────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";
const INTERNAL_SECRET =
  process.env.INTERNAL_API_SECRET || "surfsec_internal_secret_dev";

// ─────────────────────────────────────────────────────
// POST /api/scan — Authenticated, credit-gated scan
// ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Authentication ────────────────────────────
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Unauthorized. A valid session is required." },
      { status: 401 }
    );
  }

  // ── 2. Resolve user + agency ─────────────────────
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { agency: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found in database." },
      { status: 401 }
    );
  }

  if (!user.agency) {
    return NextResponse.json(
      { error: "User is not associated with any Agency." },
      { status: 403 }
    );
  }

  // ── 3. Validate input ────────────────────────────
  let domainList: string[];
  try {
    const body = await req.json();
    const raw: string = body.domains;

    if (!raw || typeof raw !== "string") {
      return NextResponse.json(
        { error: "Invalid input. Expected comma-separated domains." },
        { status: 400 }
      );
    }

    domainList = raw
      .split(",")
      .map((d: string) => d.trim())
      .filter(Boolean);

    if (domainList.length === 0) {
      return NextResponse.json(
        { error: "No valid domains provided." },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Malformed request body." },
      { status: 400 }
    );
  }

  // ── 4. Atomic credit deduction (race-safe) ───────
  //
  // Uses a raw SQL UPDATE with a WHERE guard so that
  // two concurrent requests with 1 remaining credit
  // will see exactly one succeed (row-level lock).
  // ──────────────────────────────────────────────────

  const agencyId = user.agency.id;
  let creditDeducted = false;

  try {
    const result: number = await prisma.$executeRaw`
      UPDATE "Agency"
      SET "scan_credits" = "scan_credits" - 1,
          "updatedAt"    = NOW()
      WHERE "id" = ${agencyId}
        AND "scan_credits" > 0
    `;

    // result = number of rows affected (0 = insufficient credits)
    creditDeducted = result > 0;
  } catch (err: any) {
    console.error("Credit deduction transaction failed:", err);
    return NextResponse.json(
      { error: "Internal error during credit check." },
      { status: 500 }
    );
  }

  if (!creditDeducted) {
    return NextResponse.json(
      {
        error: "Insufficient scan credits.",
        remaining_credits: 0,
      },
      { status: 402 }
    );
  }

  // ── 5. Forward to FastAPI (with pre-shared secret) ─
  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${FASTAPI_URL}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ domains: domainList }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: any) {
    // Network error or timeout — rollback credit
    console.error("FastAPI unreachable, rolling back credit:", err.message);
    await rollbackCredit(agencyId);

    return NextResponse.json(
      { error: "Backend service unreachable. Credit has been refunded." },
      { status: 502 }
    );
  }

  // ── 6. Handle backend errors → rollback ──────────
  if (!backendResponse.ok) {
    const errText = await backendResponse.text().catch(() => "Unknown error");
    console.error(
      `FastAPI returned ${backendResponse.status}, rolling back credit.`
    );
    await rollbackCredit(agencyId);

    return NextResponse.json(
      {
        error: `Backend error (${backendResponse.status}): ${errText}. Credit refunded.`,
      },
      { status: backendResponse.status >= 500 ? 502 : backendResponse.status }
    );
  }

  // ── 7. Persist scan report ───────────────────────
  const data = await backendResponse.json();

  const savedReport = await prisma.scanReport.create({
    data: {
      userId: user.id,
      agencyId: agencyId,
      total: data.total,
      successful: data.successful,
      failed: data.failed,
      results: data.results,
      errors: data.errors,
    },
  });

  // ── 8. Fetch updated credit balance ──────────────
  const updatedAgency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { scan_credits: true },
  });

  return NextResponse.json({
    report: savedReport,
    remaining_credits: updatedAgency?.scan_credits ?? 0,
  });
}

// ─────────────────────────────────────────────────────
// GET /api/scan — Authenticated scan history
// ─────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, agencyId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 401 });
  }

  try {
    const reports = await prisma.scanReport.findMany({
      where: user.agencyId
        ? { agencyId: user.agencyId }
        : { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const allResults = reports.flatMap(
      (report) => report.results as any[]
    );

    return NextResponse.json(allResults);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

async function rollbackCredit(agencyId: string) {
  try {
    await prisma.$executeRaw`
      UPDATE "Agency"
      SET "scan_credits" = "scan_credits" + 1,
          "updatedAt"    = NOW()
      WHERE "id" = ${agencyId}
    `;
    console.log(`Credit rolled back for agency ${agencyId}`);
  } catch (err) {
    // Critical: log loudly but don't crash the response
    console.error("CRITICAL: Failed to rollback credit for", agencyId, err);
  }
}
