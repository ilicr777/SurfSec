"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [agencyName, setAgencyName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, agencyName }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Registration failed.")
        return
      }

      router.push("/login?registered=true")
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <h1 className="mb-6 text-2xl font-bold text-white">Create Agency Account</h1>

        {error && (
          <div className="mb-4 rounded-md bg-red-950/50 border border-red-800 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Agency Name</label>
            <input 
              type="text" 
              value={agencyName}
              onChange={e => setAgencyName(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              required 
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              required 
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={8}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              required 
            />
            <p className="mt-1 text-xs text-zinc-500">Minimum 8 characters</p>
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full rounded-md bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <a href="/login" className="text-blue-400 hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  )
}
