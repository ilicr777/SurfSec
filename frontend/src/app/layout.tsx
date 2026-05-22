import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SurfSec Dashboard",
  description: "Security scanning dashboard",
};

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex h-screen overflow-hidden bg-zinc-950`}
      >
        {session ? (
          <>
            <Sidebar />
            <div className="flex-1 flex flex-col ml-64 overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-6 bg-background">
                {children}
              </main>
            </div>
          </>
        ) : (
          <main className="flex-1 h-screen overflow-y-auto">
            {children}
          </main>
        )}
      </body>
    </html>
  );
}
