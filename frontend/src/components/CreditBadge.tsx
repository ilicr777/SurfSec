"use client"

import { useState, useEffect } from "react"

export default function CreditBadge() {
  const [credits, setCredits] = useState<number | null>(null)

  const fetchCredits = async () => {
    try {
      const res = await fetch("/api/credits")
      if (res.ok) {
        const data = await res.json()
        if (typeof data.credits === "number") {
          setCredits(data.credits)
        }
      }
    } catch (error) {
      console.error("Failed to fetch credits:", error)
    }
  }

  useEffect(() => {
    fetchCredits()

    const handleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail !== undefined && typeof customEvent.detail === "number") {
        setCredits(customEvent.detail)
      } else {
        fetchCredits()
      }
    }

    window.addEventListener("credits-updated", handleUpdate)
    return () => {
      window.removeEventListener("credits-updated", handleUpdate)
    }
  }, [])

  if (credits === null) {
    return (
      <div className="px-3 py-1 rounded-full text-sm font-semibold flex items-center shadow-sm bg-zinc-800/50 text-zinc-400 border border-zinc-800 animate-pulse">
        Crediti...
      </div>
    )
  }

  return (
    <div
      className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center shadow-sm transition-all duration-300 ${
        credits > 0
          ? "bg-zinc-800/80 text-blue-400 border border-blue-900/50"
          : "bg-red-950/50 text-red-400 border border-red-900/50"
      }`}
    >
      Crediti Rimanenti: {credits}
    </div>
  )
}
