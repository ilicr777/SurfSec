import CreditBadge from "@/components/CreditBadge"
import { LogoutButton } from "@/components/LogoutButton"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function Header() {
  const session = await getServerSession(authOptions)

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-6 sticky top-0 z-10 w-full">
      <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <span className="text-white font-bold tracking-tight">SurfSec</span>
        <span>/</span>
        <span>Dashboard</span>
      </div>
      <div className="flex items-center gap-6">
        {session && <CreditBadge />}
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-zinc-300">{session?.user?.email}</div>
          {session && <LogoutButton />}
        </div>
      </div>
    </header>
  )
}
