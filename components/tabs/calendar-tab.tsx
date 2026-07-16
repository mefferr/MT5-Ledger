"use client"

import { useMemo, useState } from "react"
import { useStatement } from "@/lib/store"
import { dailyStats, formatCompact, formatCurrency, formatPct, monthlyStats } from "@/lib/analytics"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

function addMonths(y: number, m: number, delta: number) {
  const d = new Date(y, m + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

function monthKey(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`
}

function dayKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate()
}

const WEEK_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function CalendarTab() {
  const { statement, breakevenTickets } = useStatement()
  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])
  const daily = useMemo(() => (statement ? dailyStats(statement.trades, breakevenSet) : []), [statement, breakevenSet])
  const monthly = useMemo(() => (statement ? monthlyStats(statement.trades, breakevenSet) : []), [statement, breakevenSet])

  const dailyMap = useMemo(() => new Map(daily.map((d) => [d.date, d])), [daily])
  const monthlyMap = useMemo(() => new Map(monthly.map((m) => [m.key, m])), [monthly])

  // default to last month with activity
  const lastMonth = monthly[monthly.length - 1]
  const initial = useMemo(() => {
    if (lastMonth) {
      const [y, m] = lastMonth.key.split("-").map(Number)
      return { year: y, month: m - 1 }
    }
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  }, [lastMonth])

  const [{ year, month }, setCursor] = useState(initial)

  if (!statement) return null
  const currency = statement.account.currency

  // intensity scale based on max absolute daily profit in this month
  const monthStats = monthlyMap.get(monthKey(year, month))
  const monthDays: Array<{ date: Date; key: string }> = []
  const dim = daysInMonth(year, month)
  for (let d = 1; d <= dim; d++) {
    monthDays.push({ date: new Date(year, month, d), key: dayKey(year, month, d) })
  }
  const absMax = monthDays.reduce((m, d) => {
    const v = dailyMap.get(d.key)
    if (!v) return m
    return Math.max(m, Math.abs(v.profit))
  }, 0) || 1

  // Compose week grid with leading/trailing blanks (Mon = first day)
  const firstDay = new Date(year, month, 1)
  const leadingBlanks = (firstDay.getDay() + 6) % 7 // Mon=0
  const totalCells = Math.ceil((leadingBlanks + dim) / 7) * 7
  const cells: Array<{ day?: number; key?: string } | null> = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - leadingBlanks + 1
    if (dayNum < 1 || dayNum > dim) cells.push(null)
    else cells.push({ day: dayNum, key: dayKey(year, month, dayNum) })
  }

  function cellColor(profit: number) {
    const pct = Math.min(1, Math.abs(profit) / absMax)
    const alpha = 0.15 + pct * 0.6
    if (profit > 0) return `color-mix(in oklch, var(--primary) ${Math.round(alpha * 100)}%, transparent)`
    if (profit < 0) return `color-mix(in oklch, var(--destructive) ${Math.round(alpha * 100)}%, transparent)`
    return "var(--muted)"
  }

  const title = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })

  const monthProfit = monthStats?.profit ?? 0
  const monthTrades = monthStats?.trades ?? 0
  const monthWinRate = monthStats?.winRate ?? 0

  const bestDay = [...monthDays]
    .map((d) => dailyMap.get(d.key))
    .filter(Boolean)
    .sort((a, b) => (b!.profit - a!.profit))[0]
  const worstDay = [...monthDays]
    .map((d) => dailyMap.get(d.key))
    .filter(Boolean)
    .sort((a, b) => (a!.profit - b!.profit))[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Trading calendar</h2>
          <p className="text-sm text-muted-foreground">Daily P/L heatmap · green = profit, red = loss</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c.year, c.month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[180px] rounded-md border border-border bg-card px-4 py-1.5 text-center font-medium">
            {title}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c.year, c.month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCursor(initial)}>
            Latest
          </Button>
        </div>
      </div>

      {/* Summary + mini list */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label="Month P/L" value={formatCurrency(monthProfit, currency)} tone={monthProfit >= 0 ? "profit" : "loss"} />
        <MiniStat label="Trades" value={String(monthTrades)} />
        <MiniStat label="Win rate" value={formatPct(monthWinRate, 1)} />
        <MiniStat
          label="Active days"
          value={String(monthDays.filter((d) => dailyMap.has(d.key)).length)}
          hint={`${dim} days in month`}
        />
      </div>

      {/* Calendar grid + side panel */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card xl:col-span-3">
          <div className="grid grid-cols-7 border-b border-border bg-background/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            {WEEK_HEADERS.map((w) => (
              <div key={w} className="px-3 py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((c, i) => {
              if (!c)
                return (
                  <div
                    key={i}
                    className="h-28 border-b border-r border-border/60 bg-background/20"
                  />
                )
              const stat = dailyMap.get(c.key!)
              return (
                <div
                  key={i}
                  className="relative h-28 border-b border-r border-border/60 p-2 transition-colors hover:bg-secondary/40"
                  style={{ background: stat ? cellColor(stat.profit) : undefined }}
                  title={
                    stat
                      ? `${c.key}: ${formatCurrency(stat.profit, currency)} · ${stat.trades} trades`
                      : c.key
                  }
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-[11px] text-muted-foreground">{c.day}</span>
                    {stat && (
                      <span className="rounded bg-background/60 px-1 font-mono text-[10px] tnum">
                        {stat.trades}
                      </span>
                    )}
                  </div>
                  {stat && (
                    <div className="mt-4 space-y-0.5">
                      <div
                        className={cn(
                          "font-mono text-sm tnum",
                          stat.profit >= 0 ? "text-primary" : "text-destructive",
                        )}
                      >
                        {stat.profit >= 0 ? "+" : ""}
                        {formatCompact(stat.profit, currency)}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {stat.wins}W · {stat.losses}L
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-medium">This month</div>
            <div className="mt-1 text-xs text-muted-foreground">Best &amp; worst day</div>
            <div className="mt-3 space-y-2">
              {bestDay ? (
                <DayRow tone="profit" date={bestDay.date} profit={bestDay.profit} trades={bestDay.trades} currency={currency} />
              ) : (
                <EmptyRow />
              )}
              {worstDay && worstDay.date !== bestDay?.date ? (
                <DayRow tone="loss" date={worstDay.date} profit={worstDay.profit} trades={worstDay.trades} currency={currency} />
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-medium">Month breakdown</div>
            <ul className="mt-3 space-y-2 max-h-72 overflow-y-auto thin-scroll pr-1">
              {monthDays
                .map((d) => dailyMap.get(d.key))
                .filter(Boolean)
                .sort((a, b) => (b!.profit - a!.profit))
                .map((d) => (
                  <li key={d!.date} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{d!.date}</span>
                    <span className={cn("font-mono tnum", d!.profit >= 0 ? "text-primary" : "text-destructive")}>
                      {d!.profit >= 0 ? "+" : ""}
                      {formatCompact(d!.profit, currency)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>

      {/* All months mini grid */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-medium">All months</div>
          <div className="text-xs text-muted-foreground">Click to jump</div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {monthly.map((m) => {
            const [y, mo] = m.key.split("-").map(Number)
            const isActive = y === year && mo - 1 === month
            return (
              <button
                key={m.key}
                onClick={() => setCursor({ year: y, month: mo - 1 })}
                className={cn(
                  "flex flex-col rounded-md border px-3 py-2 text-left transition-colors",
                  isActive ? "border-primary/60 bg-primary/10" : "border-border bg-background/60 hover:bg-secondary",
                )}
              >
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <span className={cn("font-mono text-sm tnum", m.profit >= 0 ? "text-primary" : "text-destructive")}>
                  {m.profit >= 0 ? "+" : ""}
                  {formatCompact(m.profit, currency)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {m.trades} trades · {formatPct(m.winRate, 0)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "profit" | "loss" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-xl tnum",
          tone === "profit" && "text-primary",
          tone === "loss" && "text-destructive",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

function DayRow({
  tone,
  date,
  profit,
  trades,
  currency,
}: {
  tone: "profit" | "loss"
  date: string
  profit: number
  trades: number
  currency: string
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2">
      <div>
        <div className="text-xs text-muted-foreground">{tone === "profit" ? "Best day" : "Worst day"}</div>
        <div className="font-mono text-xs">{date}</div>
      </div>
      <div className="text-right">
        <div className={cn("font-mono tnum", tone === "profit" ? "text-primary" : "text-destructive")}>
          {profit >= 0 ? "+" : ""}
          {formatCompact(profit, currency)}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">{trades} trades</div>
      </div>
    </div>
  )
}

function EmptyRow() {
  return <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No trades this month</div>
}
