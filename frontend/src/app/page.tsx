"use client"

import { useState, useEffect } from "react"
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
import { Loader2 } from "lucide-react"

import { validateDomains } from "@/utils/validation"

export default function DashboardPage() {
  const [domains, setDomains] = useState("")
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [credits, setCredits] = useState<number | null>(null)

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
        }
      })
      .catch(console.error)
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const validation = validateDomains(domains)
    if (!validation.valid) {
      alert(validation.error)
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
        setResults(prev => [data.report, ...prev])
        setDomains("")
        if (typeof data.remaining_credits === 'number') {
          setCredits(data.remaining_credits)
        }
      } else {
        alert(data.error || "Failed to scan domains")
        if (typeof data.remaining_credits === 'number') {
          setCredits(data.remaining_credits)
        }
      }
    } catch (error) {
      alert("Error submitting request")
    } finally {
      setLoading(false)
    }
  }

  const formatPorts = (ports: any[]) => {
    if (!ports || ports.length === 0) return "None"
    return ports.map(p => p.port).join(", ")
  }

  const getTechStack = (ports: any[]) => {
    if (!ports || ports.length === 0) return "Unknown"
    const stack = ports
      .map(p => p.banner ? p.banner.split(" ")[0] : null)
      .filter(Boolean)
    return stack.length > 0 ? Array.from(new Set(stack)).join(", ") : "Unknown"
  }

  const getCriticalCount = (cveData: any) => {
    if (!cveData || !cveData.entries) return 0
    return cveData.entries.filter((c: any) => c.severity === "CRITICAL").length
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Start a new security scan or review recent results.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Scan</CardTitle>
          <CardDescription>Enter multiple domains separated by commas to start a new scan.</CardDescription>
        </CardHeader>
        <CardContent>
          {credits !== null && credits <= 0 && (
            <div className="mb-6 p-4 rounded-md bg-yellow-900/30 border border-yellow-700/50 flex items-start gap-4">
              <div className="text-yellow-500 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
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
              className="min-h-[100px] resize-y"
              disabled={loading || (credits !== null && credits <= 0)}
            />
            <Button type="submit" disabled={loading || !domains.trim() || (credits !== null && credits <= 0)}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning...</> : "Start Scan"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Scan Results</CardTitle>
          <CardDescription>Latest vulnerabilities and stack info discovered.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Tech Stack</TableHead>
                  <TableHead>Open Ports</TableHead>
                  <TableHead>Critical CVEs</TableHead>
                  <TableHead>Lead Contacts</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fetching ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : results.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                      No scans found. Start a scan above!
                    </TableCell>
                  </TableRow>
                ) : results.map((result, i) => (
                  <TableRow key={result.domain + i}>
                    <TableCell className="font-medium">{result.domain}</TableCell>
                    <TableCell>{getTechStack(result.shodan?.open_ports)}</TableCell>
                    <TableCell>{formatPorts(result.shodan?.open_ports)}</TableCell>
                    <TableCell>
                      {getCriticalCount(result.cve) > 0 ? (
                        <span className="text-destructive font-bold">{getCriticalCount(result.cve)}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {result.dns?.mx_records?.[0] || `admin@${result.domain}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm">View Report</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
