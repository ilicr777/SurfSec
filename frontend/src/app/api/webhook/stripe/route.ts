import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Stripe signature verification failed:", err.message);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  const existing = await prisma.stripeEvent.findUnique({
    where: { id: event.id },
  });

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const agencyId = session.metadata?.agencyId;
    const creditsRaw = session.metadata?.credits_amount;

    if (!agencyId || !creditsRaw) {
      console.error("Webhook missing metadata:", { agencyId, creditsRaw });
      await prisma.stripeEvent.create({
        data: {
          id: event.id,
          type: event.type,
          agencyId: agencyId || null,
          creditsAdded: 0,
        },
      });
      return NextResponse.json({ received: true, error: "Missing metadata" });
    }

    const creditsAmount = parseInt(creditsRaw, 10);

    if (isNaN(creditsAmount) || creditsAmount <= 0) {
      console.error("Invalid credits_amount:", creditsRaw);
      await prisma.stripeEvent.create({
        data: {
          id: event.id,
          type: event.type,
          agencyId,
          creditsAdded: 0,
        },
      });
      return NextResponse.json({ received: true, error: "Invalid credits_amount" });
    }

    await prisma.$executeRaw`
      UPDATE "Agency"
      SET "scan_credits" = "scan_credits" + ${creditsAmount},
          "updatedAt"    = NOW()
      WHERE "id" = ${agencyId}
    `;

    await prisma.stripeEvent.create({
      data: {
        id: event.id,
        type: event.type,
        agencyId,
        creditsAdded: creditsAmount,
      },
    });

    console.log(
      `Stripe webhook: +${creditsAmount} credits for agency ${agencyId} (event ${event.id})`
    );
  }

  return NextResponse.json({ received: true });
}
