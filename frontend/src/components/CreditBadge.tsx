import { getServerSession } from "next-auth"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export default async function CreditBadge() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { agency: true }
  })

  const credits = user?.agency?.scan_credits || 0

  return (
    <div className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center shadow-sm ${credits > 0 ? 'bg-zinc-800/80 text-blue-400 border border-blue-900/50' : 'bg-red-950/50 text-red-400 border border-red-900/50'}`}>
      Crediti Rimanenti: {credits}
    </div>
  )
}
