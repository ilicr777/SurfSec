import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";
const INTERNAL_SECRET =
  process.env.INTERNAL_API_SECRET || "surfsec_internal_secret_dev";

const TEST_BYPASS_SECRET = process.env.TEST_BYPASS_SECRET;
const TEST_USER_EMAIL = "test_automation@nexus.local";

async function resolveTestUser(): Promise<{ id: string; agencyId: string } | null> {
  if (process.env.NODE_ENV !== "development") return null;

  const agency = await prisma.agency.upsert({
    where: { id: "test-agency-e2e" },
    update: {},
    create: {
      id: "test-agency-e2e",
      name: "E2E Test Agency",
      scan_credits: 100,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: {
      email: TEST_USER_EMAIL,
      name: "E2E Automation",
      agencyId: agency.id,
    },
  });

  return { id: user.id, agencyId: agency.id };
}

export async function POST(req: NextRequest) {
  let userId: string;
  let agencyId: string;

  const bypassHeader = req.headers.get("x-test-bypass-secret");
  const isDev = process.env.NODE_ENV === "development";

  if (isDev && bypassHeader && TEST_BYPASS_SECRET && bypassHeader === TEST_BYPASS_SECRET) {
    const testUser = await resolveTestUser();
    if (!testUser) {
      return NextResponse.json({ error: "Test user setup failed" }, { status: 500 });
    }
    userId = testUser.id;
    agencyId = testUser.agencyId;
  } else {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, agencyId: true },
    });

    if (!user || !user.agencyId) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    userId = user.id;
    agencyId = user.agencyId;
  }

  let domainList: string[];
  try {
    const body = await req.json();
    const raw: string = body.domains;

    if (!raw || typeof raw !== "string") {
      return NextResponse.json(
        { error: "Input non valido. Inserire domini separati da virgola." },
        { status: 400 }
      );
    }

    domainList = raw
      .split(",")
      .map((d: string) => d.trim())
      .filter(Boolean);

    if (domainList.length === 0) {
      return NextResponse.json(
        { error: "Nessun dominio valido fornito." },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Corpo della richiesta non valido." },
      { status: 400 }
    );
  }

  const deductionResult: number = await prisma.$executeRaw`
    UPDATE "Agency"
    SET "scan_credits" = "scan_credits" - 1,
        "updatedAt"    = NOW()
    WHERE "id" = ${agencyId}
      AND "scan_credits" > 0
  `;

  if (deductionResult === 0) {
    return NextResponse.json(
      { error: "Crediti insufficienti", remaining_credits: 0 },
      { status: 403 }
    );
  }

  const savedReport = await prisma.scanReport.create({
    data: {
      userId: userId,
      agencyId,
      total: domainList.length,
      successful: 0,
      failed: 0,
      status: "PENDING",
      results: [],
      errors: {},
    },
  });

  // Trigger FastAPI asynchronously (non-blocking background call)
  fetch(`${FASTAPI_URL}/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": INTERNAL_SECRET,
    },
    body: JSON.stringify({
      domains: domainList,
      report_id: savedReport.id,
      agency_id: agencyId,
    }),
  }).catch((err: any) => {
    console.error("FastAPI background trigger error:", err.message);
  });

  const updatedAgency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { scan_credits: true },
  });

  return NextResponse.json(
    {
      report: savedReport,
      remaining_credits: updatedAgency?.scan_credits ?? 0,
    },
    { status: 202 }
  );
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Non autenticato" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, agencyId: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Non autenticato" },
      { status: 401 }
    );
  }

  const reports = await prisma.scanReport.findMany({
    where: user.agencyId
      ? { agencyId: user.agencyId }
      : { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const allResults = reports.flatMap(
    (report) => {
      const results = (report.results as any[]) || [];
      return results.map(r => ({ ...r, createdAt: report.createdAt, reportId: report.id }));
    }
  );

  return NextResponse.json(allResults);
}

async function rollbackCredit(agencyId: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE "Agency"
      SET "scan_credits" = "scan_credits" + 1,
          "updatedAt"    = NOW()
      WHERE "id" = ${agencyId}
    `;
  } catch (err) {
    console.error("CRITICO: rollback credito fallito per", agencyId, err);
  }
}
