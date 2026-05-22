"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const registered = searchParams.get("registered") === "true"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (res?.ok) {
      router.push("/")
    } else {
      setError("Invalid email or password.")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <h1 className="mb-6 text-2xl font-bold text-white">Sign In to SurfSec</h1>

        {registered && (
          <div className="mb-4 rounded-md bg-green-950/50 border border-green-800 p-3 text-sm text-green-400">
            Account created successfully. Please sign in.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md bg-red-950/50 border border-red-800 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              required 
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full rounded-md bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-500">
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-blue-400 hover:underline">Create one</a>
        </p>
      </div>
    </div>
  )
}
