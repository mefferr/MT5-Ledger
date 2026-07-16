"use client"

import { useMemo } from "react"
import { useStatement } from "@/lib/store"
import { formatCompact, formatCurrency, formatPct, symbolStats } from "@/lib/analytics"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { cn } from "@/lib/utils"

export function SymbolsTab() {
  const { statement, breakevenTickets } = useStatement()
  if (!statement) return null
  const currency = statement.account.currency
  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])
  const stats = useMemo(() => symbolStats(statement.trades, breakevenSet), [statement, breakevenSet])

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-medium">Symbols traded</div>
          <div className="text-xs text-muted-foreground">
            {stats.length} instrument{stats.length === 1 ? "" : "s"} · sorted by net P/L
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background/60 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Symbol</th>
                <th className="px-4 py-2">Trades</th>
                <th className="px-4 py-2">Win rate</th>
                <th className="px-4 py-2">Volume</th>
                <th className="px-4 py-2">Avg size</th>
                <th className="px-4 py-2">Largest win</th>
                <th className="px-4 py-2">Largest loss</th>
                <th className="px-4 py-2">PF</th>
                <th className="px-4 py-2 text-right">Net P/L</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.symbol} className="border-t border-border">
                  <td className="px-4 py-2 font-medium uppercase">{s.symbol}</td>
                  <td className="px-4 py-2 font-mono tnum">{s.trades}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono tnum w-12">{formatPct(s.winRate, 1)}</span>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn("h-full", s.winRate >= 0.5 ? "bg-primary" : "bg-destructive")}
                          style={{ width: `${Math.max(3, s.winRate * 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono tnum">{s.volume.toFixed(2)}</td>
                  <td className="px-4 py-2 font-mono tnum">{s.avgSize.toFixed(2)}</td>
                  <td className="px-4 py-2 font-mono tnum text-primary">{formatCompact(s.largestWin, currency)}</td>
                  <td className="px-4 py-2 font-mono tnum text-destructive">{formatCompact(s.largestLoss, currency)}</td>
                  <td className="px-4 py-2 font-mono tnum">
                    {Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-mono tnum",
                      s.profit >= 0 ? "text-primary" : "text-destructive",
                    )}
                  >
                    {s.profit >= 0 ? "+" : ""}
                    {formatCurrency(s.profit, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Net P/L by symbol</div>
          </div>
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats} layout="vertical" margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="symbol"
                  stroke="var(--muted-foreground)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.[0] ? (
                      <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                        <div className="font-mono text-muted-foreground">{payload[0].payload.symbol}</div>
                        <div className="font-mono tnum">{formatCurrency(payload[0].payload.profit, currency)}</div>
                      </div>
                    ) : null
                  }
                  cursor={{ fill: "var(--secondary)", opacity: 0.3 }}
                />
                <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                  {stats.map((s, i) => (
                    <Cell key={i} fill={s.profit >= 0 ? "var(--primary)" : "var(--destructive)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Trade count by symbol</div>
          </div>
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="symbol" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.[0] ? (
                      <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                        <div className="font-mono text-muted-foreground">{payload[0].payload.symbol}</div>
                        <div className="font-mono tnum">{payload[0].value} trades</div>
                      </div>
                    ) : null
                  }
                  cursor={{ fill: "var(--secondary)", opacity: 0.3 }}
                />
                <Bar dataKey="trades" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
