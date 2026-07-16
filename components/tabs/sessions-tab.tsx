"use client"

import { useMemo } from "react"
import { useStatement } from "@/lib/store"
import { formatCompact, formatCurrency, formatPct, sessionStats } from "@/lib/analytics"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Clock, Globe2, MoonStar, Sunrise } from "lucide-react"
import { cn } from "@/lib/utils"

const ICONS: Record<string, typeof Clock> = {
  Sydney: MoonStar,
  Tokyo: Sunrise,
  London: Globe2,
  "New York": Clock,
}

export function SessionsTab() {
  const { statement, breakevenTickets } = useStatement()
  if (!statement) return null
  const currency = statement.account.currency
  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])
  const sessions = useMemo(() => sessionStats(statement.trades, breakevenSet), [statement, breakevenSet])

  // heatmap: hour (UTC) x day-of-week
  const heat = useMemo(() => {
    const grid: Array<Array<{ hour: number; day: number; profit: number; trades: number }>> = []
    for (let d = 0; d < 7; d++) {
      const row: Array<{ hour: number; day: number; profit: number; trades: number }> = []
      for (let h = 0; h < 24; h++) row.push({ hour: h, day: d, profit: 0, trades: 0 })
      grid.push(row)
    }
    for (const t of statement.trades) {
      const h = t.openTime.getUTCHours()
      const d = t.openTime.getUTCDay()
      if (!Number.isFinite(h) || !Number.isFinite(d)) continue
      grid[d][h].profit += t.profit + t.commission + t.swap
      grid[d][h].trades += 1
    }
    const absMax = grid.flat().reduce((m, c) => Math.max(m, Math.abs(c.profit)), 0) || 1
    return { grid, absMax }
  }, [statement])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {sessions.map((s) => {
          const Icon = ICONS[s.name] ?? Clock
          return (
            <div key={s.name} className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent ring-1 ring-accent/30">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{s.range}</div>
                    </div>
                  </div>
                </div>
                <div className={cn("font-mono text-sm tnum", s.profit >= 0 ? "text-primary" : "text-destructive")}>
                  {s.profit >= 0 ? "+" : ""}
                  {formatCompact(s.profit, currency)}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md border border-border bg-background/60 px-2 py-1">
                  <div className="text-[10px] text-muted-foreground">Trades</div>
                  <div className="font-mono tnum">{s.trades}</div>
                </div>
                <div className="rounded-md border border-border bg-background/60 px-2 py-1">
                  <div className="text-[10px] text-muted-foreground">Wins</div>
                  <div className="font-mono tnum text-primary">{s.wins}</div>
                </div>
                <div className="rounded-md border border-border bg-background/60 px-2 py-1">
                  <div className="text-[10px] text-muted-foreground">Losses</div>
                  <div className="font-mono tnum text-destructive">{s.losses}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>WR</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn("h-full", s.winRate >= 0.5 ? "bg-primary" : "bg-destructive")}
                    style={{ width: `${Math.max(3, s.winRate * 100)}%` }}
                  />
                </div>
                <span className="font-mono tnum text-foreground">{formatPct(s.winRate, 1)}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Session P/L</div>
            <div className="text-xs text-muted-foreground">Sessions overlap — trades counted in each active session</div>
          </div>
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessions} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.[0] ? (
                      <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                        <div className="font-mono text-muted-foreground">{payload[0].payload.name}</div>
                        <div className="font-mono tnum">{formatCurrency(payload[0].payload.profit, currency)}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {payload[0].payload.trades} trades · {formatPct(payload[0].payload.winRate, 1)} WR
                        </div>
                      </div>
                    ) : null
                  }
                  cursor={{ fill: "var(--secondary)", opacity: 0.3 }}
                />
                <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                  {sessions.map((s, i) => (
                    <Cell key={i} fill={s.profit >= 0 ? "var(--primary)" : "var(--destructive)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Hour × Weekday heatmap</div>
            <div className="text-xs text-muted-foreground">UTC — green = net profit · red = net loss</div>
          </div>
          <div className="thin-scroll overflow-x-auto p-3">
            <table className="w-full text-[10px]">
              <thead>
                <tr>
                  <th className="px-1 py-1 text-left font-medium text-muted-foreground"></th>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <th key={h} className="px-0.5 py-1 font-mono text-muted-foreground">
                      {String(h).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, di) => (
                  <tr key={d}>
                    <td className="px-1 py-1 font-mono text-muted-foreground">{d}</td>
                    {heat.grid[di].map((c) => {
                      const pct = Math.min(1, Math.abs(c.profit) / heat.absMax)
                      const bg = c.profit > 0
                        ? `color-mix(in oklch, var(--primary) ${Math.round((0.1 + pct * 0.8) * 100)}%, transparent)`
                        : c.profit < 0
                        ? `color-mix(in oklch, var(--destructive) ${Math.round((0.1 + pct * 0.8) * 100)}%, transparent)`
                        : "transparent"
                      return (
                        <td
                          key={c.hour}
                          className="h-7 w-7 rounded border border-border/40"
                          style={{ background: bg }}
                          title={`${d} ${String(c.hour).padStart(2, "0")}:00 · ${formatCurrency(c.profit, currency)} · ${c.trades} trades`}
                        />
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
