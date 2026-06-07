import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  let agencyId: string | null;

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

    if (!user) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
    }

    userId = user.id;
    agencyId = user.agencyId;
  }

  const { id } = await params;

  const report = await prisma.scanReport.findUnique({
    where: { id },
  });

  if (!report) {
    return NextResponse.json(
      { error: "Report non trovato" },
      { status: 404 }
    );
  }

  // Multi-tenancy check
  if (agencyId) {
    if (report.agencyId !== agencyId) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
  } else {
    if (report.userId !== userId) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }
  }

  return NextResponse.json({
    id: report.id,
    status: report.status,
    total: report.total,
    successful: report.successful,
    failed: report.failed,
    results: report.results,
    errors: report.errors,
    createdAt: report.createdAt,
  });
}
