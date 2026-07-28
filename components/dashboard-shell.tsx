"use client"

import { useMemo, useState } from "react"
import { useStatement } from "@/lib/store"
import { computeKPI } from "@/lib/analytics"
import { Button } from "@/components/ui/button"
import {
  BarChart3,
  CalendarDays,
  ChartNoAxesCombined,
  CircleGauge,
  Clock,
  Flame,
  LayoutDashboard,
  LineChart,
  ListOrdered,
  RefreshCw,
  Target,
  Upload,
  Zap,
  Wallet,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { OverviewTab } from "@/components/tabs/overview-tab"
import { TradesTab } from "@/components/tabs/trades-tab"
import { CalendarTab } from "@/components/tabs/calendar-tab"
import { PerformanceTab } from "@/components/tabs/performance-tab"
import { AnalyticsTab } from "@/components/tabs/analytics-tab"
import { SymbolsTab } from "@/components/tabs/symbols-tab"
import { SessionsTab } from "@/components/tabs/sessions-tab"
import { RiskTab } from "@/components/tabs/risk-tab"
import { StreaksTab } from "@/components/tabs/streaks-tab"
import { GoyaTab } from "@/components/tabs/goya-tab"
import { Mt5Tab } from "@/components/tabs/mt5-tab"
import { Terminal } from "lucide-react"

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "performance", label: "Performance", icon: ChartNoAxesCombined },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "symbols", label: "Symbols", icon: Target },
  { id: "sessions", label: "Sessions", icon: Clock },
  { id: "risk", label: "Risk", icon: CircleGauge },
  { id: "streaks", label: "Streaks", icon: Flame },
  { id: "trades", label: "Trades", icon: ListOrdered },
  { id: "goya", label: "GOYA", icon: Zap },
  { id: "mt5", label: "Live MT5", icon: Terminal },
] as const

type TabId = (typeof TABS)[number]["id"]

export function DashboardShell() {
  const {
    statement,
    clear,
    loadDemo,
    loadFromMt5,
    loading,
    converting,
    convertCurrency,
    isSimulated,
    simulateAccount,
    resetSimulation,
    mergeStats,
    breakevenTickets,
  } = useStatement()
  const [active, setActive] = useState<TabId>("overview")
  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])
  const kpi = useMemo(() => (statement ? computeKPI(statement, breakevenSet) : null), [statement, breakevenSet])

  if (!statement || !kpi) return null

  const profitColor =
    kpi.netProfit > 0 ? "text-primary" : kpi.netProfit < 0 ? "text-destructive" : "text-muted-foreground"
  const canConvertCurrency = statement && statement.account.currency !== "—"
  const isMt5 = statement.account.title?.startsWith("MT5")

  return (
    <div className="min-h-dvh bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
              <LineChart className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Ledger</span>
                <span className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Beta
                </span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">
                {statement.account.title || "MetaTrader statement"}
              </span>
            </div>
            <div className="mx-3 hidden h-8 w-px bg-border md:block" />
            <div className="hidden flex-wrap items-center gap-4 text-xs text-muted-foreground md:flex">
              <InfoPair label="Account" value={statement.account.account || "—"} />
              <InfoPair label="Name" value={statement.account.name || "—"} />
              <InfoPair label="Currency" value={statement.account.currency} />
              <InfoPair label="Leverage" value={statement.account.leverage || "—"} />
              {mergeStats && mergeStats.mergedLegCount > 0 && (
                <InfoPair
                  label="Trades"
                  value={`${mergeStats.displayCount} (${mergeStats.sourceCount} legs)`}
                />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs md:flex">
              <span className="text-muted-foreground">Net</span>
              <span className={cn("tnum", profitColor)}>
                {kpi.netProfit >= 0 ? "+" : ""}
                {new Intl.NumberFormat("en-US", { style: "currency", currency: statement.account.currency, notation: "compact", maximumFractionDigits: 2 }).format(kpi.netProfit)}
              </span>
            </div>
            {isMt5 && (
              <Button size="sm" variant="outline" onClick={() => loadFromMt5(30)} disabled={loading} className="px-2 sm:px-3">
                <RefreshCw className={cn("h-3.5 w-3.5 sm:mr-2", loading && "animate-spin")} /> 
                <span className="hidden sm:inline">Refresh MT5 Data</span>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={loadDemo} disabled={loading} className="px-2 sm:px-3">
              <RefreshCw className="h-3.5 w-3.5 sm:mr-2" /> 
              <span className="hidden sm:inline">Reload demo</span>
            </Button>
            {canConvertCurrency && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={converting} className="px-2 sm:px-3">
                    <span className="hidden sm:inline">{converting ? "Converting..." : "Convert Currency"}</span>
                    <span className="sm:hidden">{converting ? "..." : "$->"}</span>
                    <ChevronDown className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {["USD", "EUR", "GBP", "AUD", "CAD", "PLN", "JPY", "CHF"].map(c => (
                    <DropdownMenuItem key={c} onClick={() => convertCurrency(c)} disabled={statement.account.currency.toUpperCase() === c}>
                      Convert to {c}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <SimulatePopover />
            <Button size="sm" variant="secondary" onClick={clear} className="px-2 sm:px-3">
              <Upload className="h-3.5 w-3.5 sm:mr-2" /> 
              <span className="hidden sm:inline">New statement</span>
            </Button>
          </div>
        </div>

        {/* Tabs row */}
        <div className="thin-scroll overflow-x-auto border-t border-border/60 px-2 md:px-4">
          <div className="flex min-w-max items-center gap-1 py-1.5">
            {TABS.map((t) => {
              const Icon = t.icon
              const activeTab = active === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActive(t.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                    activeTab
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-6">
        {active === "overview" && <OverviewTab />}
        {active === "performance" && <PerformanceTab />}
        {active === "calendar" && <CalendarTab />}
        {active === "analytics" && <AnalyticsTab />}
        {active === "symbols" && <SymbolsTab />}
        {active === "sessions" && <SessionsTab />}
        {active === "risk" && <RiskTab />}
        {active === "streaks" && <StreaksTab />}
        {active === "trades" && <TradesTab />}
        {active === "goya" && <GoyaTab />}
        {active === "mt5" && <Mt5Tab />}
      </main>
    </div>
  )
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">{label}</span>
      <span className="font-mono text-xs text-foreground/90">{value}</span>
    </div>
  )
}

function SimulatePopover() {
  const { statement, isSimulated, simulateAccount, resetSimulation } = useStatement()
  const [open, setOpen] = useState(false)

  const initialDeposit = statement?.initialDeposit || 10000
  const [depositInput, setDepositInput] = useState(initialDeposit.toString())
  const [multiplierInput, setMultiplierInput] = useState("1")
  const [autoLink, setAutoLink] = useState(true)

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen && statement) {
      setDepositInput(statement.initialDeposit.toString())
      setMultiplierInput("1")
      setAutoLink(true)
    }
  }

  const handleDepositChange = (val: string) => {
    setDepositInput(val)
    const num = parseFloat(val)
    if (autoLink && !isNaN(num) && num > 0 && initialDeposit > 0) {
      const ratio = num / initialDeposit
      setMultiplierInput((Math.round(ratio * 100) / 100).toString())
    }
  }

  const handleApply = () => {
    const dep = parseFloat(depositInput)
    const mult = parseFloat(multiplierInput)
    if (!isNaN(dep) && dep > 0 && !isNaN(mult) && mult > 0) {
      simulateAccount(dep, mult)
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={isSimulated ? "secondary" : "outline"}
          className={cn("px-2 sm:px-3 relative", isSimulated && "border-amber-500/50 text-amber-400 bg-amber-500/10")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 sm:mr-2" />
          <span className="hidden sm:inline">{isSimulated ? "Simulated" : "Simulate Size"}</span>
          <span className="sm:hidden">Sim</span>
          {isSimulated && (
            <span className="ml-1.5 flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4 space-y-4">
        <div className="space-y-1">
          <h4 className="font-semibold text-sm flex items-center justify-between">
            <span>Account Size Simulator</span>
            {isSimulated && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono uppercase">
                Active
              </span>
            )}
          </h4>
          <p className="text-xs text-muted-foreground">
            Rescale initial deposit & lot sizes proportionally. Clamped at 0.01 lot minimum.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">New Initial Deposit</label>
            <Input
              type="number"
              value={depositInput}
              onChange={(e) => handleDepositChange(e.target.value)}
              placeholder="e.g. 1000"
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Lot Size Multiplier</label>
              <button
                type="button"
                onClick={() => setAutoLink(!autoLink)}
                className="text-[10px] text-primary hover:underline"
              >
                {autoLink ? "Auto-linked (1:1)" : "Custom Override"}
              </button>
            </div>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                value={multiplierInput}
                onChange={(e) => {
                  setAutoLink(false)
                  setMultiplierInput(e.target.value)
                }}
                placeholder="1.0"
                className="h-8 text-xs font-mono pr-8"
              />
              <span className="absolute right-2.5 top-2 text-xs font-mono text-muted-foreground pointer-events-none">
                x
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={handleApply} className="flex-1 h-8 text-xs">
            Apply Simulation
          </Button>
          {isSimulated && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                resetSimulation()
                setOpen(false)
              }}
              className="h-8 text-xs text-destructive hover:text-destructive"
            >
              Reset
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
