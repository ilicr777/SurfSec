import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, agencyId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const reportId = resolvedParams.id;

    const report = await prisma.scanReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return NextResponse.json({ error: "Report non trovato" }, { status: 404 });
    }

    // Multi-tenancy check
    if (user.agencyId) {
      if (report.agencyId !== user.agencyId) {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
      }
    } else {
      if (report.userId !== user.id) {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
      }
    }

    // Array of results
    const results = (report.results as any[]) || [];

    // Columns: Domain, IP, Country, Open Ports, Detected Tech, Critical CVEs Count, Scanned At, Lead Emails, Cold Email Draft
    const headers = [
      "Domain",
      "IP",
      "Country",
      "Open Ports",
      "Detected Tech",
      "Critical CVEs Count",
      "Lead Emails",
      "Cold Email Draft"
    ];

    // CSV Escaping helper
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      // Escape double quotes by doubling them, and wrap the field in double quotes
      if (str.includes(",") || str.includes("\"") || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = results.map((r: any) => {
      // Extract IP
      const ip = r.shodan?.ip || r.dns?.a_records?.[0] || "";
      const country = r.shodan?.country || "";
      
      // Open Ports
      const portsArr = r.shodan?.open_ports || [];
      const openPorts = portsArr.map((p: any) => p.port).join("; ");
      
      // Detected Tech
      const techArr = portsArr.map((p: any) => p.banner ? p.banner.split(" ")[0] : null).filter(Boolean);
      const tech = Array.from(new Set(techArr)).join("; ");

      // Critical CVEs
      const cveEntries = r.cve?.entries || [];
      const criticalCount = cveEntries.filter((c: any) => c.severity === "CRITICAL").length;

      // Lead Emails
      const emailsArr = r.emails || [];
      const leadEmails = emailsArr.join("; ");

      // Cold Email Draft
      const emailDraft = r.cold_email_template || "";

      return [
        escapeCsv(r.domain),
        escapeCsv(ip),
        escapeCsv(country),
        escapeCsv(openPorts),
        escapeCsv(tech),
        escapeCsv(criticalCount),
        escapeCsv(leadEmails),
        escapeCsv(emailDraft)
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nexus-leads-${reportId}.csv"`,
      },
    });

  } catch (error: any) {
    console.error("Export CSV Error:", error);
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 });
  }
}
