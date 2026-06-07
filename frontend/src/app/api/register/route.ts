import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agencyName, email, password } = body;

    // ── Input validation ─────────────────────────────
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Un indirizzo email valido è richiesto." },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "La password deve essere di almeno 8 caratteri." },
        { status: 400 }
      );
    }

    if (!agencyName || typeof agencyName !== "string" || !agencyName.trim()) {
      return NextResponse.json(
        { error: "Il nome dell'agenzia è richiesto." },
        { status: 400 }
      );
    }

    // ── Hash password ────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 10);

    // ── Atomic database creation ──────────────────────
    const agency = await prisma.agency.create({
      data: {
        name: agencyName,
        users: {
          create: {
            email: email.toLowerCase().trim(),
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
        message: "Account creato con successo.",
        userId: user.id,
        agencyId: agency.id,
      },
      { status: 201 }
    );
  } catch (error: any) {
    // Gestione errore constraint unique per Prisma (P2002)
    if (error.code === "P2002" || error.message?.includes("P2002")) {
      return NextResponse.json(
        { error: "Email già registrata" },
        { status: 400 }
      );
    }
    
    // Stampa stack trace sul terminale di Next.js per il debugging
    console.error("Errore durante la registrazione:", error);
    
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}

