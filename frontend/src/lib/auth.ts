import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

// Extend NextAuth types to carry userId and agencyId
declare module "next-auth" {
  interface User {
    agencyId?: string | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      agencyId?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    agencyId?: string | null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const email = credentials?.email?.toLowerCase().trim();
          const password = credentials?.password;

          if (!email || !password) return null;

          // ── DB lookup ────────────────────────────────
          const user = await prisma.user.findUnique({
            where: { email },
            include: { agency: true },
          });

          if (!user || !user.password) return null;

          // ── Compare hashed password ──────────────────
          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) return null;

          // ── Return user payload for JWT ───────────────
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            agencyId: user.agencyId,
          };
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }
      },
    }),
  ],

  // ── Callbacks ──────────────────────────────────────
  callbacks: {
    async jwt({ token, user }): Promise<JWT> {
      // On initial sign-in, `user` is populated
      if (user) {
        token.id = user.id;
        token.agencyId = (user as any).agencyId ?? null;
      }
      return token;
    },

    async session({ session, token }): Promise<Session> {
      session.user.id = token.id;
      session.user.agencyId = token.agencyId ?? null;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
