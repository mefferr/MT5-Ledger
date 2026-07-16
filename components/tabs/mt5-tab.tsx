"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { toast } from "sonner"
import {
  Zap,
  RefreshCw,
  Play,
  Square,
  AlertCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Position {
  ticket: number
  symbol: string
  type: 'buy' | 'sell'
  volume: number
  price_open: number
  price_current: number
  sl: number
  tp: number
  profit: number
  swap: number
  time: string
  contract_size?: number
}

interface AccountInfo {
  login: number
  server: string
  balance: number
  equity: number
  currency: string
  leverage: string
  connected: boolean
}

function calcBreakeven(positions: Position[]) {
  let weightedSum = 0, totalVol = 0
  for (const p of positions) {
    const sign = p.type === 'buy' ? 1 : -1
    const vol = p.volume * sign
    weightedSum += p.price_open * vol
    totalVol += vol
  }
  if (totalVol === 0) return { price: 0, volume: 0, direction: 'long' as const }
  return {
    price: weightedSum / totalVol,
    volume: Math.abs(totalVol),
    direction: totalVol >= 0 ? 'long' as const : 'short' as const
  }
}

export function Mt5Tab() {
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // SL/TP State
  const [mode, setMode] = useState<"pips" | "breakeven" | "absolute">("pips")
  const [slEnabled, setSlEnabled] = useState(true)
  const [tpEnabled, setTpEnabled] = useState(true)
  const [slValue, setSlValue] = useState("150")
  const [tpValue, setTpValue] = useState("300")
  const [sltpDelay, setSltpDelay] = useState("300")
  
  // Open Position State
  const [openSymbol, setOpenSymbol] = useState("XAUUSD")
  const [openDir, setOpenDir] = useState<"buy" | "sell">("buy")
  const [openLots, setOpenLots] = useState("0.01")
  const [openCount, setOpenCount] = useState("50")
  const [openDelay, setOpenDelay] = useState("300")

  // Progress State
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, fail: 0 })
  const abortController = useRef<AbortController | null>(null)

  const fetchState = useCallback(async () => {
    try {
      const [accRes, posRes] = await Promise.all([
        fetch("/api/mt5/account", { headers: { "ngrok-skip-browser-warning": "true" } }),
        fetch("/api/mt5/positions", { headers: { "ngrok-skip-browser-warning": "true" } })
      ])
      
      if (!accRes.ok || !posRes.ok) throw new Error("Bridge returning error")
      
      const acc = await accRes.json()
      const pos = await posRes.json()
      
      setAccount(acc)
      setPositions(pos)
      setError(null)
    } catch (err) {
      setError("Could not connect to MT5 bridge. Ensure mt5_bridge.py is running.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 5000) // Poll every 5s
    return () => clearInterval(interval)
  }, [fetchState])

  const breakeven = useMemo(() => calcBreakeven(positions), [positions])

  const { totalRisk, totalReward } = useMemo(() => {
    let risk = 0
    let reward = 0
    for (const p of positions) {
      const contractSize = p.contract_size || 100 // fallback if python server not restarted
      if (p.type === 'buy') {
        if (p.sl > 0) risk += (p.sl - p.price_open) * p.volume * contractSize
        if (p.tp > 0) reward += (p.tp - p.price_open) * p.volume * contractSize
      } else {
        if (p.sl > 0) risk += (p.price_open - p.sl) * p.volume * contractSize
        if (p.tp > 0) reward += (p.price_open - p.tp) * p.volume * contractSize
      }
    }
    return { totalRisk: risk, totalReward: reward }
  }, [positions])

  const stopTask = () => {
    if (abortController.current) {
      abortController.current.abort()
      setIsRunning(false)
      toast.warning("Task aborted by user")
    }
  }

  const applySltp = async () => {
    if (!slEnabled && !tpEnabled) {
      toast.error("Enable SL or TP to apply changes")
      return
    }
    
    if (positions.length === 0) {
      toast.error("No open positions to modify")
      return
    }

    const sl = parseFloat(slValue)
    const tp = parseFloat(tpValue)
    const delay = parseInt(sltpDelay)
    
    if (slEnabled && isNaN(sl)) return toast.error("Invalid SL value")
    if (tpEnabled && isNaN(tp)) return toast.error("Invalid TP value")
    if (isNaN(delay) || delay < 0) return toast.error("Invalid delay")

    setIsRunning(true)
    setProgress({ current: 0, total: positions.length, success: 0, fail: 0 })
    abortController.current = new AbortController()
    const signal = abortController.current.signal

    let successCount = 0
    let failCount = 0

    // Fetch symbol info for the first position to get point value
    let point = 0.01
    let digits = 2
    try {
      const symRes = await fetch(`/api/mt5/symbol-info/${positions[0].symbol}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      })
      if (symRes.ok) {
        const symInfo = await symRes.json()
        point = symInfo.point
        digits = symInfo.digits
      }
    } catch (e) {}

    // Precalculate breakeven SL/TP if needed
    let beSlPrice = 0
    let beTpPrice = 0
    if (mode === "breakeven" && breakeven.price > 0) {
      const pipsToPrice = (pips: number) => pips * 10 * point
      if (breakeven.direction === "long") {
        beSlPrice = breakeven.price - pipsToPrice(sl)
        beTpPrice = breakeven.price + pipsToPrice(tp)
      } else {
        beSlPrice = breakeven.price + pipsToPrice(sl)
        beTpPrice = breakeven.price - pipsToPrice(tp)
      }
    }

    for (let i = 0; i < positions.length; i++) {
      if (signal.aborted) break
      
      const p = positions[i]
      let newSl = p.sl
      let newTp = p.tp
      
      if (mode === "absolute") {
        if (slEnabled) newSl = sl
        if (tpEnabled) newTp = tp
      } else if (mode === "pips") {
        const pipsToPrice = (pips: number) => pips * 10 * point
        if (p.type === "buy") {
          if (slEnabled) newSl = p.price_open - pipsToPrice(sl)
          if (tpEnabled) newTp = p.price_open + pipsToPrice(tp)
        } else {
          if (slEnabled) newSl = p.price_open + pipsToPrice(sl)
          if (tpEnabled) newTp = p.price_open - pipsToPrice(tp)
        }
      } else if (mode === "breakeven") {
        if (slEnabled) newSl = beSlPrice
        if (tpEnabled) newTp = beTpPrice
      }
      
      newSl = Number(newSl.toFixed(digits))
      newTp = Number(newTp.toFixed(digits))
      
      try {
        const res = await fetch("/api/mt5/modify", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true"
          },
          body: JSON.stringify({ ticket: p.ticket, symbol: p.symbol, sl: newSl, tp: newTp }),
          signal
        })
        const data = await res.json()
        if (data.success) {
          successCount++
        } else {
          failCount++
          if (data.retcode === 10018) {
            toast.error("Market is closed!")
          } else {
            toast.error(`Order failed: ${data.comment || data.retcode || 'Unknown error'}`)
          }
          if (abortController.current) abortController.current.abort()
        }
      } catch (e: any) {
        if (!signal.aborted) {
          failCount++
          toast.error(`Execution error: ${e.message}`)
          if (abortController.current) abortController.current.abort()
        }
      }
      
      setProgress({ current: i + 1, total: positions.length, success: successCount, fail: failCount })
      if (i < positions.length - 1 && !signal.aborted) {
        await new Promise(r => setTimeout(r, delay))
      }
    }

    setIsRunning(false)
    if (!signal.aborted) {
      toast.success(`Completed: ${successCount} OK, ${failCount} failed`)
    }
    fetchState()
  }

  const openBatch = async () => {
    const lots = parseFloat(openLots)
    const count = parseInt(openCount)
    const delay = parseInt(openDelay)
    
    if (!openSymbol) return toast.error("Symbol required")
    if (isNaN(lots) || lots <= 0) return toast.error("Invalid lot size")
    if (isNaN(count) || count <= 0) return toast.error("Invalid count")
    if (isNaN(delay) || delay < 0) return toast.error("Invalid delay")

    setIsRunning(true)
    setProgress({ current: 0, total: count, success: 0, fail: 0 })
    abortController.current = new AbortController()
    const signal = abortController.current.signal

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < count; i++) {
      if (signal.aborted) break
      
      try {
        const res = await fetch("/api/mt5/open", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true"
          },
          body: JSON.stringify({ symbol: openSymbol, type: openDir, volume: lots }),
          signal
        })
        const data = await res.json()
        if (data.success) {
          successCount++
        } else {
          failCount++
          if (data.retcode === 10018) {
            toast.error("Market is closed!")
          } else {
            toast.error(`Order failed: ${data.comment || data.retcode || 'Unknown error'}`)
          }
          if (abortController.current) abortController.current.abort()
        }
      } catch (e: any) {
        if (!signal.aborted) {
          failCount++
          toast.error(`Execution error: ${e.message}`)
          if (abortController.current) abortController.current.abort()
        }
      }
      
      setProgress({ current: i + 1, total: count, success: successCount, fail: failCount })
      if (i < count - 1 && !signal.aborted) {
        await new Promise(r => setTimeout(r, delay))
      }
    }

    setIsRunning(false)
    if (!signal.aborted) {
      toast.success(`Completed: ${successCount} opened, ${failCount} failed`)
    }
    fetchState()
  }

  if (loading) {
    return <div className="flex justify-center items-center h-96 text-muted-foreground animate-pulse">Connecting to MT5 Bridge...</div>
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      {/* Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={cn("h-3 w-3 rounded-full", account?.connected ? "bg-primary shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-destructive shadow-[0_0_10px_rgba(239,68,68,0.5)]")} />
          <div>
            <div className="font-medium tracking-tight">{account ? account.server : "Not connected"}</div>
            <div className="text-xs text-muted-foreground font-mono">Login: {account?.login || "—"}</div>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 text-sm w-full sm:w-auto border-t border-border/50 sm:border-none pt-3 sm:pt-0">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Balance</span>
            <span className="font-mono tnum font-medium">
              {account ? new Intl.NumberFormat('en-US', { style: 'currency', currency: account.currency }).format(account.balance) : "—"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Equity</span>
            <span className="font-mono tnum font-medium text-accent">
              {account ? new Intl.NumberFormat('en-US', { style: 'currency', currency: account.currency }).format(account.equity) : "—"}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchState} disabled={isRunning} className="text-muted-foreground hover:text-foreground shrink-0">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* SL/TP Panel */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Stop Loss & Take Profit</CardTitle>
            <CardDescription>Apply batch changes to all open positions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup value={mode} onValueChange={(v: any) => setMode(v)} className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pips" id="r-pips" />
                <Label htmlFor="r-pips">Pips</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="breakeven" id="r-be" />
                <Label htmlFor="r-be">Breakeven</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="absolute" id="r-abs" />
                <Label htmlFor="r-abs">Price</Label>
              </div>
            </RadioGroup>

            {mode === "breakeven" && (
              <div className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm text-accent flex justify-between items-center">
                <span>Breakeven Price</span>
                <span className="font-mono font-bold tracking-tight">
                  {breakeven.price > 0 ? breakeven.price.toFixed(5) : "—"}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="c-sl" checked={slEnabled} onCheckedChange={(c) => setSlEnabled(!!c)} />
                  <Label htmlFor="c-sl" className="font-semibold text-muted-foreground">STOP LOSS</Label>
                </div>
                <Input 
                  value={slValue} 
                  onChange={(e) => setSlValue(e.target.value)} 
                  disabled={!slEnabled} 
                  className={cn("font-mono text-lg", slEnabled && "text-destructive border-destructive/50")} 
                />
                <p className="text-[10px] text-muted-foreground uppercase">{mode === 'absolute' ? 'Exact Price' : `Pips from ${mode === 'breakeven' ? 'breakeven' : 'entry'}`}</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="c-tp" checked={tpEnabled} onCheckedChange={(c) => setTpEnabled(!!c)} />
                  <Label htmlFor="c-tp" className="font-semibold text-muted-foreground">TAKE PROFIT</Label>
                </div>
                <Input 
                  value={tpValue} 
                  onChange={(e) => setTpValue(e.target.value)} 
                  disabled={!tpEnabled} 
                  className={cn("font-mono text-lg", tpEnabled && "text-primary border-primary/50")} 
                />
                <p className="text-[10px] text-muted-foreground uppercase">{mode === 'absolute' ? 'Exact Price' : `Pips from ${mode === 'breakeven' ? 'breakeven' : 'entry'}`}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4 pt-2">
              <div className="space-y-2 w-full sm:w-1/3">
                <Label className="text-xs uppercase text-muted-foreground">Delay (ms)</Label>
                <Input value={sltpDelay} onChange={(e) => setSltpDelay(e.target.value)} className="font-mono text-accent bg-accent/5 border-accent/20" />
              </div>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full sm:w-2/3" disabled={isRunning || positions.length === 0 || (!slEnabled && !tpEnabled)}>
                    <Zap className="mr-2 h-4 w-4" /> Apply to All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apply SL/TP to all positions?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will modify {positions.length} position(s).
                    </AlertDialogDescription>
                    <div className="mt-4 p-4 rounded bg-secondary/50 space-y-2 font-mono text-sm text-foreground">
                      <div className="flex justify-between"><span>Mode:</span> <span className="uppercase text-muted-foreground">{mode}</span></div>
                      <div className="flex justify-between"><span>SL:</span> <span className={cn(slEnabled && "text-destructive font-bold")}>{slEnabled ? slValue : "Skip"}</span></div>
                      <div className="flex justify-between"><span>TP:</span> <span className={cn(tpEnabled && "text-primary font-bold")}>{tpEnabled ? tpValue : "Skip"}</span></div>
                      <div className="flex justify-between"><span>Delay:</span> <span className="text-accent">{sltpDelay}ms</span></div>
                    </div>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={applySltp} className="bg-primary hover:bg-primary/90 text-primary-foreground">Confirm & Apply</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        {/* Open Batch Panel */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Open New Positions</CardTitle>
            <CardDescription>Rapidly deploy multiple positions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground font-semibold">Symbol</Label>
                <Input value={openSymbol} onChange={(e) => setOpenSymbol(e.target.value.toUpperCase())} className="font-mono uppercase text-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground font-semibold">Direction</Label>
                <RadioGroup value={openDir} onValueChange={(v: any) => setOpenDir(v)} className="flex h-10 items-center gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="buy" id="o-buy" className="text-primary border-primary" />
                    <Label htmlFor="o-buy" className="text-primary font-bold tracking-widest">BUY</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sell" id="o-sell" className="text-destructive border-destructive" />
                    <Label htmlFor="o-sell" className="text-destructive font-bold tracking-widest">SELL</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">Lots</Label>
                <Input value={openLots} onChange={(e) => setOpenLots(e.target.value)} className="font-mono text-center sm:text-left" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">Count</Label>
                <Input value={openCount} onChange={(e) => setOpenCount(e.target.value)} className="font-mono text-center sm:text-left" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">Delay (ms)</Label>
                <Input value={openDelay} onChange={(e) => setOpenDelay(e.target.value)} className="font-mono text-accent text-center sm:text-left bg-accent/5 border-accent/20" />
              </div>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full mt-2" disabled={isRunning} variant="secondary">
                  <Play className="mr-2 h-4 w-4" /> Deploy Positions
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Execute batch order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will send {openCount} market orders sequentially.
                  </AlertDialogDescription>
                  <div className="mt-4 p-4 rounded bg-secondary/50 space-y-2 font-mono text-sm text-foreground">
                    <div className="flex justify-between"><span>Symbol:</span> <span className="font-bold">{openSymbol}</span></div>
                    <div className="flex justify-between"><span>Action:</span> <span className={cn("font-bold", openDir === 'buy' ? 'text-primary' : 'text-destructive')}>{openDir.toUpperCase()}</span></div>
                    <div className="flex justify-between"><span>Volume:</span> <span>{openLots} lots (Total: {(parseFloat(openLots) * parseInt(openCount)).toFixed(2)})</span></div>
                    <div className="flex justify-between"><span>Delay:</span> <span className="text-accent">{openDelay}ms</span></div>
                  </div>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={openBatch}>Confirm & Deploy</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      {isRunning && (
        <Card className="border-accent/50 shadow-[0_0_15px_rgba(251,146,60,0.1)]">
          <CardContent className="flex items-center gap-6 p-5">
            <div className="flex-1 space-y-3">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-accent flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Executing batch...
                </span>
                <span className="font-mono tnum">
                  {progress.current} / {progress.total} ({progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%)
                </span>
              </div>
              <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} className="h-2" />
              <div className="flex justify-between text-xs font-mono">
                <span className="text-primary">✓ Success: {progress.success}</span>
                <span className="text-destructive">✗ Failed: {progress.fail}</span>
              </div>
            </div>
            <Button variant="destructive" size="icon" onClick={stopTask} className="h-12 w-12 rounded-full shrink-0">
              <Square className="h-5 w-5 fill-current" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Positions Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Open Positions</CardTitle>
              <CardDescription>{positions.length} active positions</CardDescription>
            </div>
            <div className="flex flex-wrap sm:flex-nowrap gap-4 sm:gap-6 sm:text-right font-mono text-sm">
              <div className="flex flex-col sm:items-end">
                <span className="text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Total Risk</span>
                <span className={cn("font-bold text-lg", totalRisk < 0 ? "text-destructive" : "text-muted-foreground")}>
                  {totalRisk < 0 ? "" : "+"}{totalRisk.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col sm:items-end">
                <span className="text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Total Reward</span>
                <span className={cn("font-bold text-lg", totalReward > 0 ? "text-primary" : "text-muted-foreground")}>
                  {totalReward > 0 ? "+" : ""}{totalReward.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col sm:items-end w-full sm:w-auto">
                <span className="text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Current P/L</span>
                <span className={cn("font-bold text-lg", positions.reduce((a,b)=>a+b.profit,0) >= 0 ? "text-primary" : "text-destructive")}>
                  {positions.reduce((a,b)=>a+b.profit,0) >= 0 ? "+" : ""}
                  {positions.reduce((a,b)=>a+b.profit,0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border w-full overflow-hidden">
            <div className="w-full overflow-x-auto thin-scroll">
              <Table>
                <TableHeader className="bg-secondary/40">
                  <TableRow>
                    <TableHead className="w-[100px] whitespace-nowrap">Ticket</TableHead>
                    <TableHead className="whitespace-nowrap">Symbol</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Lots</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Entry</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Current</TableHead>
                    <TableHead className="text-right whitespace-nowrap">SL</TableHead>
                    <TableHead className="text-right whitespace-nowrap">TP</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Profit</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {positions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      No open positions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  [...positions].sort((a, b) => b.ticket - a.ticket).map((p) => (
                    <TableRow key={p.ticket} className="hover:bg-secondary/20 transition-colors">
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.ticket}</TableCell>
                      <TableCell className="font-medium">{p.symbol}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px] uppercase font-bold tracking-wider", p.type === 'buy' ? "text-primary border-primary/30 bg-primary/5" : "text-destructive border-destructive/30 bg-destructive/5")}>
                          {p.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tnum text-muted-foreground">{p.volume.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tnum">{p.price_open.toFixed(5)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tnum">{p.price_current.toFixed(5)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tnum text-destructive">
                        {p.sl > 0 ? p.sl.toFixed(5) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tnum text-primary">
                        {p.tp > 0 ? p.tp.toFixed(5) : "—"}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono text-sm tnum font-bold", p.profit >= 0 ? "text-primary" : "text-destructive")}>
                        {p.profit >= 0 ? "+" : ""}{p.profit.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
      </Card>
    </div>
  )
}
