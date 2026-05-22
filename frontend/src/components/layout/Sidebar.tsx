import Link from 'next/link'

export function Sidebar() {
  return (
    <div className="w-64 h-screen border-r bg-background flex flex-col fixed left-0 top-0">
      <div className="p-6 text-2xl font-bold border-b h-16 flex items-center">
        SurfSec
      </div>
      <nav className="flex-1 p-4 space-y-2">
        <Link href="/" className="block px-4 py-2 rounded-md hover:bg-muted font-medium transition-colors">Dashboard</Link>
        <Link href="/scans" className="block px-4 py-2 rounded-md hover:bg-muted font-medium transition-colors">Scans</Link>
        <Link href="/settings" className="block px-4 py-2 rounded-md hover:bg-muted font-medium transition-colors">Settings</Link>
      </nav>
    </div>
  )
}
