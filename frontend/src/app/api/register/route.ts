import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, agencyName } = body;

    // ── Input validation ─────────────────────────────
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email is required." },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    if (!agencyName || typeof agencyName !== "string" || !agencyName.trim()) {
      return NextResponse.json(
        { error: "Agency name is required." },
        { status: 400 }
      );
    }

    // ── Hash password ────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 10);

    // ── Atomic database creation ──────────────────────
    const agency = await prisma.agency.create({
      data: {
        name: agencyName.trim(),
        scan_credits: 5, // Free-tier onboarding credits
        users: {
          create: {
            email: email.toLowerCase().trim(),
            name: agencyName.trim(),
            password: hashedPassword,
          },
        },
      },
      include: {
        users: true,
      },
    });

    const user = agency.users[0];

    return NextResponse.json(
      {
        message: "Account created successfully.",
        userId: user.id,
        agencyId: agency.id,
      },
      { status: 201 }
    );
  } catch (error: any) {
    // Prisma unique constraint violation error code is P2002
    if (error.code === "P2002" || error.message?.includes("P2002")) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 400 }
      );
    }
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "An internal error occurred. Please try again." },
      { status: 500 }
    );
  }
}

