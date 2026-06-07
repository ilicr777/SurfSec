"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

export default function ScansPage() {
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/scan")
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`Errore HTTP ${res.status}: ${text}`)
        }
        return res.json()
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setResults(data)
        } else {
          setError("Formato dati non valido ricevuto dal server.")
        }
      })
      .catch((err) => {
        console.error("Errore nel fetch delle scansioni:", err)
        setError("Impossibile caricare lo storico delle scansioni.")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

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
        <h1 className="text-3xl font-bold tracking-tight">Storico Scansioni</h1>
        <p className="text-muted-foreground mt-2">
          Visualizza l'elenco di tutti i domini analizzati in passato.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Archivio Risultati</CardTitle>
          <CardDescription>Dettagli storici e vulnerabilità rilevate.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-6 p-4 rounded-md bg-red-950/40 border border-red-800/60 flex items-start gap-4 text-red-400 text-sm">
              <p>{error}</p>
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Tech Stack</TableHead>
                  <TableHead>Open Ports</TableHead>
                  <TableHead>Critical CVEs</TableHead>
                  <TableHead>Scanned At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : results.length === 0 && !error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                      Nessuna scansione trovata nell'archivio.
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
                    <TableCell className="text-muted-foreground">
                      {result.createdAt ? new Date(result.createdAt).toLocaleString("it-IT") : "N/D"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => alert(`Report per ${result.domain}\n\nTecnologie: ${getTechStack(result.shodan?.open_ports)}\nPorte: ${formatPorts(result.shodan?.open_ports)}\nCVE Critiche: ${getCriticalCount(result.cve)}`)}
                      >
                        View
                      </Button>
                      {result.reportId && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => window.open(`/api/scan/${result.reportId}/export`, '_blank')}
                        >
                          Download CSV
                        </Button>
                      )}
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
