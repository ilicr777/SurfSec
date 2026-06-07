"use client"

import { useState, useEffect } from "react"
import { getSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldCheck, Coins, Key } from "lucide-react"

export default function SettingsPage() {
  const [session, setSession] = useState<any>(null)
  const [status, setStatus] = useState("loading")
  const [credits, setCredits] = useState<number | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(true)

  // API keys state
  const [shodanKey, setShodanKey] = useState("••••••••••••••••")
  const [hunterKey, setHunterKey] = useState("••••••••••••••••")
  const [openaiKey, setOpenaiKey] = useState("••••••••••••••••")

  useEffect(() => {
    // 1. Fetch Session
    getSession().then((sess) => {
      setSession(sess)
      setStatus(sess ? "authenticated" : "unauthenticated")
    })

    // 2. Fetch Credits
    fetch("/api/credits")
      .then((res) => {
        if (res.ok) return res.json()
        throw new Error("Errore nel recupero crediti")
      })
      .then((data) => {
        if (typeof data.credits === "number") {
          setCredits(data.credits)
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setCreditsLoading(false))
  }, [])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Mock Save Keys:", { shodanKey, hunterKey, openaiKey })
    alert("Integrazioni API salvate con successo (Mock)!")
  }

  const isLoading = status === "loading"

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Impostazioni SaaS</h1>
        <p className="text-muted-foreground mt-2">
          Gestisci il profilo B2B, i consumi di credito e le chiavi delle integrazioni esterne.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Pannello Consumi & Profilo */}
        <div className="space-y-6">
          <Card className="border-blue-900/40 bg-zinc-950/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-blue-400" />
                  Pannello Consumi
                </CardTitle>
                <CardDescription>
                  Crediti disponibili per scansioni e arricchimento OSINT.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-col items-center justify-center p-6 border border-zinc-800 rounded-lg bg-zinc-900/50">
                <span className="text-sm font-medium text-zinc-400">Crediti Rimanenti</span>
                {creditsLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500 mt-2" />
                ) : (
                  <span className={`text-4xl font-extrabold tracking-tight mt-2 ${
                    credits !== null && credits > 0 ? "text-blue-400" : "text-red-400"
                  }`}>
                    {credits !== null ? credits : "N/D"}
                  </span>
                )}
                <div className="w-full bg-zinc-800 h-2 rounded-full mt-4 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full transition-all duration-500" 
                    style={{ width: credits !== null ? `${Math.min(100, (credits / 100) * 100)}%` : "0%" }}
                  />
                </div>
                <span className="text-xs text-zinc-500 mt-2">Piano Enterprise attivo con scalabilità automatica</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-400" />
                Profilo Agenzia
              </CardTitle>
              <CardDescription>
                Dettagli identificativi del tuo account di sicurezza.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-zinc-400">
                  Email Utente
                </label>
                <input
                  type="email"
                  disabled
                  value={isLoading ? "Caricamento..." : (session?.user?.email || "Nessuna email")}
                  className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400 opacity-70 cursor-not-allowed"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none text-zinc-400">
                  Nome Agenzia
                </label>
                <input
                  type="text"
                  disabled
                  value={isLoading ? "Caricamento..." : (session?.user?.name || "Agenzia di " + (session?.user?.email?.split("@")[0] || "Default"))}
                  className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400 opacity-70 cursor-not-allowed"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pannello API Key di Terze Parti */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-yellow-400" />
                API Key di Terze Parti
              </CardTitle>
              <CardDescription>
                Configura le chiavi esterne per bypassare le limitazioni di arricchimento dati standard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none text-zinc-300">
                    SHODAN_API_KEY
                  </label>
                  <input
                    type="password"
                    placeholder="Inserisci Shodan Key"
                    value={shodanKey}
                    onChange={(e) => setShodanKey(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none text-zinc-300">
                    HUNTER_IO_API_KEY
                  </label>
                  <input
                    type="password"
                    placeholder="Inserisci Hunter.io Key"
                    value={hunterKey}
                    onChange={(e) => setHunterKey(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none text-zinc-300">
                    OPENAI_API_KEY
                  </label>
                  <input
                    type="password"
                    placeholder="Inserisci OpenAI Key"
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <Button type="submit" className="w-full mt-6">
                  Salva Configurazione
                </Button>
              </form>
            </CardContent>
          </div>
        </Card>
      </div>
    </div>
  )
}
