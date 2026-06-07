"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { 
  Loader2, 
  Globe, 
  Shield, 
  Server, 
  Mail, 
  Cpu, 
  Copy, 
  Check, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  ChevronRight, 
  Download 
} from "lucide-react"

import { validateDomains } from "@/utils/validation"

// Subcomponent: Row for OSINT contact email with copy feedback
function EmailCopyRow({ email, isFallback = false }: { email: string; isFallback?: boolean }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between p-2.5 bg-zinc-900/40 border border-zinc-800/80 rounded-lg hover:border-zinc-700/80 transition-colors">
      <div className="flex items-center gap-2 overflow-hidden mr-2">
        <span className="h-2 w-2 rounded-full bg-violet-400 shrink-0"></span>
        <span className="text-xs font-mono text-zinc-200 truncate">{email}</span>
        {isFallback && (
          <span className="px-1.5 py-0.5 bg-zinc-800/50 text-zinc-500 border border-zinc-750 rounded text-[9px] font-sans">
            Fallback Lead
          </span>
        )}
      </div>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={handleCopy} 
        className="h-7 px-2.5 bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white text-[11px] flex items-center gap-1 border border-zinc-800"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-emerald-400 animate-in zoom-in-50 duration-200" />
            <span className="text-emerald-400 text-[10px]">Copiato!</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            <span>Copia</span>
          </>
        )}
      </Button>
    </div>
  )
}

// Subcomponent: AI Copywriter Outreach Draft Box with copy button
function AiEmailBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative border border-zinc-800/80 rounded-lg overflow-hidden bg-zinc-950/80">
      {/* Action Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-900 bg-zinc-900/30">
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">AI Cold Email Outreach Template</span>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleCopy}
          className="h-7 px-3 hover:bg-zinc-800 text-zinc-400 hover:text-white text-[10px] flex items-center gap-1.5 border border-zinc-800 rounded bg-zinc-900/40"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400 animate-in zoom-in-50 duration-200" />
              <span className="text-emerald-400 font-bold">Copiato negli appunti!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy to Clipboard</span>
            </>
          )}
        </Button>
      </div>

      {/* Editor preview block */}
      <pre className="p-4 text-xs font-mono text-zinc-300 whitespace-pre-wrap overflow-y-auto max-h-72 leading-relaxed bg-zinc-950 select-text">
        {text}
      </pre>
    </div>
  )
}

export default function DashboardPage() {
  const [domains, setDomains] = useState("")
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [credits, setCredits] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<any | null>(null)

  const intervalsRef = useRef<any[]>([])

  useEffect(() => {
    fetch("/api/scan")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setResults(data)
        }
      })
      .catch(console.error)
      .finally(() => setFetching(false))

    // Fetch credits
    fetch("/api/credits")
      .then(res => res.json())
      .then(data => {
        if (typeof data.credits === 'number') {
          setCredits(data.credits)
          // Sync with the badge
          window.dispatchEvent(new CustomEvent("credits-updated", { detail: data.credits }))
        }
      })
      .catch(console.error)

    // Cleanup active polling intervals on component unmount
    return () => {
      intervalsRef.current.forEach(clearInterval)
    }
  }, [])

  const startPolling = (reportId: string) => {
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/${reportId}/status`)
        if (!res.ok) return
        
        const statusData = await res.json()
        
        if (statusData.status === "COMPLETED") {
          clearInterval(intervalId)
          intervalsRef.current = intervalsRef.current.filter(id => id !== intervalId)
          
          const completed = (statusData.results || []).map((r: any) => ({
            ...r,
            reportId,
            createdAt: statusData.createdAt || new Date().toISOString(),
            isPlaceholder: false
          }))

          setResults(prev => {
            const filtered = prev.filter(r => !(r.reportId === reportId && r.isPlaceholder))
            return [...completed, ...filtered]
          })
          
          // Re-fetch credits to ensure they match exactly
          fetch("/api/credits")
            .then(r => r.json())
            .then(d => {
              if (typeof d.credits === 'number') {
                setCredits(d.credits)
                window.dispatchEvent(new CustomEvent("credits-updated", { detail: d.credits }))
              }
            })
            .catch(console.error)
            
        } else if (statusData.status === "FAILED") {
          clearInterval(intervalId)
          intervalsRef.current = intervalsRef.current.filter(id => id !== intervalId)
          
          setResults(prev => {
            return prev.map(r => {
              if (r.reportId === reportId && r.isPlaceholder) {
                return {
                  ...r,
                  status: "FAILED",
                  error: statusData.errors?.[r.domain] || "Errore generico durante la scansione."
                }
              }
              return r
            })
          })
        }
      } catch (err) {
        console.error("Errore durante il polling dello stato:", err)
      }
    }, 2000)
    
    intervalsRef.current.push(intervalId)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    const validation = validateDomains(domains)
    if (!validation.valid) {
      setError(validation.error || "Formato dei domini non valido")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: validation.domains.join(", ") }),
      })
      
      const data = await res.json()
      
      if (res.ok && data.report) {
        // Create dynamic placeholders for each domain being scanned
        const newPlaceholders = validation.domains.map(d => ({
          domain: d,
          shodan: { open_ports: [] },
          dns: {},
          cve: { entries: [] },
          emails: [],
          cold_email_template: null,
          createdAt: new Date().toISOString(),
          reportId: data.report.id,
          isPlaceholder: true,
          status: "PROCESSING"
        }))

        // Prepend placeholders fluidly
        setResults(prev => [...newPlaceholders, ...prev])
        setDomains("")
        
        // Start dynamic polling for this report
        startPolling(data.report.id)
        
        if (typeof data.remaining_credits === 'number') {
          setCredits(data.remaining_credits)
          // Dispatch event to update CreditBadge in real-time
          window.dispatchEvent(new CustomEvent("credits-updated", { detail: data.remaining_credits }))
        }
      } else {
        // If error response has remaining_credits (like insufficient credits), update it
        if (typeof data.remaining_credits === 'number') {
          setCredits(data.remaining_credits)
          window.dispatchEvent(new CustomEvent("credits-updated", { detail: data.remaining_credits }))
        }
        setError(data.error || "Errore durante la scansione dei domini.")
      }
    } catch (err: any) {
      setError("Errore di rete. Riprova più tardi.")
    } finally {
      setLoading(false)
    }
  }

  const formatPorts = (ports: any[]) => {
    if (!ports || ports.length === 0) return "None"
    return ports.map(p => p.port).join(", ")
  }

  const getTechStack = (ports: any[]) => {
    if (!ports || ports.length === 0) return ["Unknown"]
    const stack = ports
      .map(p => p.banner ? p.banner.split(" ")[0] : null)
      .filter(Boolean)
    return stack.length > 0 ? Array.from(new Set(stack)) : ["Unknown"]
  }

  const getCriticalCount = (cveData: any) => {
    if (!cveData || !cveData.entries) return 0
    return cveData.entries.filter((c: any) => c.severity === "CRITICAL").length
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Shield className="h-8 w-8 text-emerald-500" /> SurfSec Dashboard
        </h1>
        <p className="text-zinc-400 mt-2">
          Start a new security scan or review detailed, automated cold email outreach drafts.
        </p>
      </div>

      <Card className="bg-zinc-900/60 border-zinc-800/80 backdrop-blur shadow-xl">
        <CardHeader>
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <Server className="h-5 w-5 text-emerald-400" /> New Scan
          </CardTitle>
          <CardDescription className="text-zinc-400">Enter multiple domains separated by commas to start a new automated target assessment.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-6 p-4 rounded-md bg-rose-950/40 border border-rose-800/60 flex items-start gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="text-rose-500 mt-0.5 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-rose-400 font-semibold text-sm">Errore di Scansione</h4>
                <p className="text-rose-300/80 text-sm mt-1">{error}</p>
              </div>
              <button 
                onClick={() => setError(null)} 
                className="text-rose-400 hover:text-rose-300 transition-colors text-sm font-medium"
              >
                Chiudi
              </button>
            </div>
          )}

          {credits !== null && credits <= 0 && (
            <div className="mb-6 p-4 rounded-md bg-yellow-900/25 border border-yellow-700/50 flex items-start gap-4">
              <div className="text-yellow-500 mt-0.5 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-yellow-400 font-semibold mb-1">Out of Credits</h4>
                <p className="text-yellow-300/80 text-sm mb-3">You have used all your available scan credits. Please upgrade your plan to continue scanning domains and generating technical reports.</p>
                <Button size="sm" variant="outline" className="bg-yellow-950/50 border-yellow-700 text-yellow-400 hover:bg-yellow-900 hover:text-yellow-300">
                  Upgrade Plan
                </Button>
              </div>
            </div>
          )}

          <form className="space-y-4" onSubmit={onSubmit}>
            <Textarea 
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="example.com, test.local, vulnerable.net" 
              className="min-h-[100px] resize-y bg-zinc-950/60 border-zinc-800 focus-visible:ring-emerald-500/50 text-zinc-100 placeholder:text-zinc-650"
              disabled={loading || (credits !== null && credits <= 0)}
            />
            <Button 
              type="submit" 
              disabled={loading || !domains.trim() || (credits !== null && credits <= 0)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md hover:shadow-emerald-900/20 active:scale-[0.98] transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                  Analisi OSINT e arricchimento dati in corso...
                </>
              ) : (
                "Start Scan"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/60 border-zinc-800/80 backdrop-blur shadow-xl">
        <CardHeader>
          <CardTitle className="text-zinc-100 flex items-center gap-2">
            <Cpu className="h-5 w-5 text-indigo-400" /> Recent Scan Results
          </CardTitle>
          <CardDescription className="text-zinc-400">Latest vulnerabilities and tech stack discoveries enriched via DNS, Shodan & OSINT.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-zinc-800/80 overflow-hidden bg-zinc-950/40">
            <Table>
              <TableHeader className="bg-zinc-900/50">
                <TableRow className="border-zinc-800/80 hover:bg-transparent">
                  <TableHead className="text-zinc-400 font-semibold py-4">Domain</TableHead>
                  <TableHead className="text-zinc-400 font-semibold py-4">Tech Stack</TableHead>
                  <TableHead className="text-zinc-400 font-semibold py-4">Open Ports</TableHead>
                  <TableHead className="text-zinc-400 font-semibold py-4">Critical CVEs</TableHead>
                  <TableHead className="text-zinc-400 font-semibold py-4">Lead Contacts</TableHead>
                  <TableHead className="text-right text-zinc-400 font-semibold py-4 pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fetching ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="text-center h-32 text-zinc-500">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-500 mb-2" />
                      Caricamento report recenti...
                    </TableCell>
                  </TableRow>
                ) : results.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="text-center h-32 text-zinc-500">
                      No scans found. Start a scan above!
                    </TableCell>
                  </TableRow>
                ) : results.map((result, i) => {
                  const isPlaceholder = result.isPlaceholder
                  const isFailed = result.status === "FAILED"
                  
                  return (
                    <TableRow 
                      key={(result.domain || "") + i}
                      className={`border-zinc-800/85 hover:bg-zinc-900/40 transition-colors ${
                        selectedLead?.domain === result.domain ? "bg-zinc-900/60 border-l-2 border-l-emerald-500" : ""
                      }`}
                    >
                      <TableCell className="font-medium py-3.5">
                        <span className="flex items-center gap-2 text-zinc-200">
                          {isPlaceholder && !isFailed ? (
                            <Loader2 className="h-4 w-4 animate-spin text-emerald-400 shrink-0" />
                          ) : (
                            <Globe className="h-4 w-4 text-zinc-500 shrink-0" />
                          )}
                          <span className="truncate">{result.domain}</span>
                        </span>
                      </TableCell>
                      
                      <TableCell className="py-3.5">
                        {isPlaceholder ? (
                          isFailed ? (
                            <span className="text-rose-500/80 font-medium text-xs">Errore di scansione</span>
                          ) : (
                            <span className="text-zinc-500 italic text-xs animate-pulse">Analisi in corso...</span>
                          )
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {getTechStack(result.shodan?.open_ports).map((tech: string, idx: number) => {
                              const isNginx = tech.toLowerCase().includes("nginx")
                              const isApache = tech.toLowerCase().includes("apache")
                              const isSSH = tech.toLowerCase().includes("ssh") || tech.toLowerCase().includes("openssh")
                              
                              let badgeClass = "bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                              if (isNginx) badgeClass = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                              if (isApache) badgeClass = "bg-orange-500/10 text-orange-400 border border-orange-500/25"
                              if (isSSH) badgeClass = "bg-violet-500/10 text-violet-400 border border-violet-500/25"
                              
                              return (
                                <span key={tech + idx} className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${badgeClass}`}>
                                  {tech}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </TableCell>
                      
                      <TableCell className="py-3.5">
                        {isPlaceholder ? (
                          isFailed ? (
                            <span className="text-zinc-650">—</span>
                          ) : (
                            <span className="text-zinc-500 italic text-xs animate-pulse">Scansione porte...</span>
                          )
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {result.shodan?.open_ports && result.shodan.open_ports.length > 0 ? (
                              result.shodan.open_ports.slice(0, 4).map((p: any, idx: number) => (
                                <span key={p.port + idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  {p.port}
                                </span>
                              ))
                            ) : (
                              <span className="text-zinc-500 text-xs">Nessuna</span>
                            )}
                            {result.shodan?.open_ports && result.shodan.open_ports.length > 4 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                                +{result.shodan.open_ports.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      
                      <TableCell className="py-3.5">
                        {isPlaceholder ? (
                          isFailed ? (
                            <span className="text-zinc-650">—</span>
                          ) : (
                            <span className="text-zinc-500 italic text-xs animate-pulse">Analisi CVE...</span>
                          )
                        ) : (
                          (() => {
                            const criticalCount = getCriticalCount(result.cve)
                            return criticalCount > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/25 animate-pulse">
                                <AlertTriangle className="h-3 w-3 shrink-0" /> {criticalCount} Critiche
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3 shrink-0" /> Safe
                              </span>
                            )
                          })()
                        )}
                      </TableCell>
                      
                      <TableCell className="py-3.5">
                        {isPlaceholder ? (
                          isFailed ? (
                            <span className="text-zinc-650">—</span>
                          ) : (
                            <span className="text-zinc-500 italic text-xs animate-pulse">Ricerca email...</span>
                          )
                        ) : (
                          <span className="flex items-center gap-1.5 text-zinc-350 text-xs max-w-[180px] truncate font-mono">
                            <Mail className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                            <span className="truncate">{result.emails?.[0] || `admin@${result.domain}`}</span>
                          </span>
                        )}
                      </TableCell>
                      
                      <TableCell className="text-right py-3.5 pr-6 space-x-2">
                        {isPlaceholder ? (
                          isFailed ? (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setError(result.error || "Errore durante la scansione.");
                              }}
                              className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 h-8 text-xs px-2.5 rounded border border-rose-900/30"
                            >
                              Errore
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold bg-zinc-900 text-zinc-400 border border-zinc-800 rounded animate-pulse">
                              Scansione...
                            </span>
                          )
                        ) : (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => setSelectedLead(result)}
                              className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-200 hover:text-white h-8 text-xs font-medium"
                            >
                              View Report
                            </Button>
                            {result.reportId && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => window.open(`/api/scan/${result.reportId}/export`, '_blank')}
                                className="bg-zinc-900 border-zinc-850 hover:bg-zinc-800 text-zinc-300 h-8 text-xs"
                              >
                                <Download className="h-3.5 w-3.5 mr-1 text-zinc-400" /> Export
                              </Button>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Slide-over Inspection Sheet Panel */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Blur Backdrop */}
          <div 
            className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
            onClick={() => setSelectedLead(null)}
          />
          
          {/* Sheet Body Container */}
          <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-xl transform transition-transform duration-300 ease-out bg-zinc-900 border-l border-zinc-800 text-zinc-100 flex flex-col shadow-2xl h-full animate-in slide-in-from-right duration-300">
              
              {/* Drawer Header */}
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-white">{selectedLead.domain}</h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Scansione completata • {new Date(selectedLead.createdAt).toLocaleString("it-IT")}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedLead(null)}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Security Posture */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                    <Shield className="h-4 w-4 shrink-0" /> Security Posture (Vulnerability Detail)
                  </h3>
                  
                  <div className="bg-zinc-950/30 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2.5 border-b border-zinc-900">
                      <span className="text-xs text-zinc-400">Total Vulnerabilities</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        (selectedLead.cve?.entries || []).length > 0 
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}>
                        {(selectedLead.cve?.entries || []).length} Detected
                      </span>
                    </div>

                    {selectedLead.cve?.entries && selectedLead.cve.entries.length > 0 ? (
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                        {selectedLead.cve.entries.map((cve: any, idx: number) => {
                          let severityBadgeClass = "bg-zinc-850 text-zinc-400 border border-zinc-800"
                          if (cve.severity === "CRITICAL") {
                            severityBadgeClass = "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          } else if (cve.severity === "HIGH") {
                            severityBadgeClass = "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                          } else if (cve.severity === "MEDIUM") {
                            severityBadgeClass = "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                          }

                          return (
                            <div key={cve.cve_id + idx} className="p-3 bg-zinc-900/40 border border-zinc-800/60 rounded-lg space-y-1.5 hover:border-zinc-750 transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-200">{cve.cve_id}</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${severityBadgeClass}`}>
                                  {cve.severity} {cve.cvss ? `(${cve.cvss})` : ""}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-450 leading-relaxed font-sans">{cve.summary}</p>
                              {cve.source_banner && (
                                <div className="text-[10px] text-zinc-550 font-mono flex items-center gap-1.5 pt-1">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-700"></span>
                                  Source banner: {cve.source_banner}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 space-y-2">
                        <div className="h-9 w-9 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto text-emerald-400">
                          <Check className="h-4 w-4" />
                        </div>
                        <p className="text-xs text-zinc-400 font-sans">Nessuna vulnerabilità critica identificata dai banner software.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Tech Stack & Network */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                    <Server className="h-4 w-4 shrink-0" /> Tech Stack & Network Architecture
                  </h3>
                  
                  <div className="bg-zinc-950/30 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 pb-3 border-b border-zinc-900 text-xs font-sans">
                      <div>
                        <span className="text-zinc-500 block">IP address</span>
                        <span className="font-mono text-zinc-300 block mt-0.5">{selectedLead.shodan?.ip || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">ISP & Country</span>
                        <span className="text-zinc-300 block mt-0.5 truncate">
                          {selectedLead.shodan?.org || "Unknown ISP"} {selectedLead.shodan?.country ? `(${selectedLead.shodan.country})` : ""}
                        </span>
                      </div>
                    </div>

                    {selectedLead.shodan?.open_ports && selectedLead.shodan.open_ports.length > 0 ? (
                      <div className="space-y-2.5">
                        <span className="text-xs font-semibold text-zinc-350 block">Open Network Ports & Service Banners</span>
                        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                          {selectedLead.shodan.open_ports.map((port: any, idx: number) => (
                            <div key={port.port + idx} className="p-3 bg-zinc-900/40 border border-zinc-800/60 rounded-lg">
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  {port.port}/{port.protocol || "tcp"}
                                </span>
                                <span className="text-xs font-semibold text-zinc-300 font-mono">
                                  {port.transport || "TCP"}
                                </span>
                              </div>
                              {port.banner && (
                                <pre className="mt-2 p-2 bg-zinc-950 text-emerald-450 border border-zinc-900 rounded text-[10px] font-mono overflow-x-auto whitespace-pre leading-relaxed select-text">
                                  {port.banner}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-xs text-zinc-500 font-sans">
                        Nessun banner o porta aperta riscontrata nelle scansioni Shodan.
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. OSINT Leads */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-violet-400 flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" /> OSINT Target Leads
                  </h3>
                  
                  <div className="bg-zinc-950/30 border border-zinc-800/80 rounded-xl p-4 space-y-3.5">
                    <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                      Indirizzi email estratti pubblicamente associati al dominio di target, pronti per essere agganciati nelle campagne.
                    </p>
                    
                    <div className="space-y-2">
                      {selectedLead.emails && selectedLead.emails.length > 0 ? (
                        selectedLead.emails.map((email: string, idx: number) => (
                          <EmailCopyRow key={email + idx} email={email} />
                        ))
                      ) : (
                        <EmailCopyRow email={`admin@${selectedLead.domain}`} isFallback={true} />
                      )}
                    </div>

                    {selectedLead.dns && (
                      <div className="mt-3.5 pt-3.5 border-t border-zinc-900 space-y-2">
                        <span className="text-xs font-semibold text-zinc-350 block">Target DNS Records</span>
                        <div className="p-3 bg-zinc-950/50 rounded-lg border border-zinc-900 font-mono text-[10px] text-zinc-400 space-y-1">
                          <div className="truncate"><span className="text-zinc-650 mr-1.5">A:</span> {selectedLead.dns.a_records?.join(", ") || "None"}</div>
                          <div className="truncate"><span className="text-zinc-650 mr-1.5">MX:</span> {selectedLead.dns.mx_records?.join(", ") || "None"}</div>
                          <div className="truncate"><span className="text-zinc-650 mr-1.5">TXT:</span> {selectedLead.dns.txt_records?.slice(0, 2).join(", ") || "None"}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. AI Copywriting outreach draft */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                    <Cpu className="h-4 w-4 shrink-0" /> AI Copywriting Section (Core B2B Value)
                  </h3>
                  
                  <div className="bg-zinc-950/30 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                    <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                      E-mail di outreach generata da AI basata esclusivamente sui riscontri tecnici di Shodan, DNS e CVE per massimizzare il tasso di conversione.
                    </p>
                    
                    <AiEmailBox text={selectedLead.cold_email_template || `Gentile Team di ${selectedLead.domain},\n\nAbbiamo identificato diversi punti di esposizione sul perimetro esterno del vostro dominio.\nContattateci per un audit di remediation completo.\n\nCordiali saluti,\nSurfSec`} />
                  </div>
                </div>

              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between font-sans">
                <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">SurfSec B2B Intelligence</span>
                {selectedLead.reportId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs h-8"
                    onClick={() => window.open(`/api/scan/${selectedLead.reportId}/export`, '_blank')}
                  >
                    Esporta Report CSV
                  </Button>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
