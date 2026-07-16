"use client"

import { useMemo } from "react"
import { useStatement } from "@/lib/store"
import {
  buildEquityCurve,
  computeKPI,
  dailyStats,
  formatCompact,
  formatCurrency,
  formatPct,
  monthlyStats,
  rollingWinRate,
} from "@/lib/analytics"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export function PerformanceTab() {
  const { statement, breakevenTickets } = useStatement()
  if (!statement) return null
  const currency = statement.account.currency
  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])
  const kpi = useMemo(() => computeKPI(statement, breakevenSet), [statement, breakevenSet])
  const equity = useMemo(() => buildEquityCurve(statement), [statement])
  const months = useMemo(() => monthlyStats(statement.trades, breakevenSet), [statement, breakevenSet])
  const days = useMemo(() => dailyStats(statement.trades, breakevenSet), [statement, breakevenSet])
  const rolling = useMemo(() => rollingWinRate(statement.trades, 20, breakevenSet), [statement, breakevenSet])

  const equityData = equity.map((p, i) => ({
    i,
    balance: p.balance,
    peak: p.peak,
    drawdown: -p.drawdown,
    ddPct: -p.drawdownPct,
  }))

  const cumMonths = months.reduce<Array<{ label: string; cum: number; profit: number }>>(
    (acc, m) => {
      const prev = acc[acc.length - 1]?.cum ?? 0
      acc.push({ label: m.label, cum: prev + m.profit, profit: m.profit })
      return acc
    },
    [],
  )

  // Yearly summary
  const yearly = useMemo(() => {
    const map = new Map<string, { year: string; profit: number; trades: number; wins: number }>()
    for (const t of statement.trades) {
      const y = String(t.closeTime.getFullYear())
      const cur = map.get(y) ?? { year: y, profit: 0, trades: 0, wins: 0 }
      cur.profit += t.profit + t.commission + t.swap
      cur.trades += 1
      if (t.profit > 0) cur.wins += 1
      map.set(y, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.year.localeCompare(b.year))
  }, [statement])

  return (
    <div className="space-y-6">
      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Peak balance" value={formatCurrency(kpi.peakBalance, currency)} tone="accent" />
        <Stat label="Final balance" value={formatCurrency(kpi.finalBalance, currency)} tone={kpi.finalBalance >= kpi.initialDeposit ? "profit" : "loss"} />
        <Stat label="Max DD" value={`${formatCompact(kpi.maxDrawdown, currency)} · ${kpi.maxDrawdownPct.toFixed(2)}%`} tone="loss" />
        <Stat label="Recovery factor" value={Number.isFinite(kpi.recoveryFactor) ? kpi.recoveryFactor.toFixed(2) : "∞"} />
      </div>

      {/* Big equity + underwater */}
      <div className="grid grid-cols-1 gap-4">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-medium">Equity & running peak</div>
              <div className="text-xs text-muted-foreground">
                {equity.length} events · includes deposits, profits &amp; fees
              </div>
            </div>
          </div>
          <div className="h-[360px] w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eq2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="i" tickFormatter={(v) => `#${v}`} stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip content={<CurrencyTooltip currency={currency} />} />
                <Area type="monotone" dataKey="peak" stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 3" fill="transparent" />
                <Area type="monotone" dataKey="balance" stroke="var(--primary)" strokeWidth={2} fill="url(#eq2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-medium">Drawdown (underwater)</div>
              <div className="text-xs text-muted-foreground">Distance from all-time peak</div>
            </div>
          </div>
          <div className="h-56 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0} />
                    <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="i" tickFormatter={(v) => `#${v}`} stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip content={<CurrencyTooltip currency={currency} />} />
                <Area type="monotone" dataKey="drawdown" stroke="var(--destructive)" strokeWidth={2} fill="url(#dd)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly & cumulative */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Monthly returns</div>
            <div className="text-xs text-muted-foreground">Net P/L grouped by calendar month</div>
          </div>
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <Tooltip content={<CurrencyTooltip currency={currency} />} cursor={{ fill: "var(--secondary)", opacity: 0.4 }} />
                <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                  {months.map((m, i) => (
                    <Cell key={i} fill={m.profit >= 0 ? "var(--primary)" : "var(--destructive)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Cumulative monthly P/L</div>
            <div className="text-xs text-muted-foreground">Running total by month</div>
          </div>
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cumMonths} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <Tooltip content={<CurrencyTooltip currency={currency} />} />
                <Area dataKey="cum" stroke="var(--accent)" fill="url(#cum)" strokeWidth={2} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Rolling win rate + daily P/L */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Rolling win rate (20 trades)</div>
            <div className="text-xs text-muted-foreground">Short-term consistency indicator</div>
          </div>
          <div className="h-60 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rolling} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="index" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  domain={[0, 1]}
                  tickFormatter={(v) => formatPct(Number(v), 0)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.[0] ? (
                      <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                        <div className="font-mono text-muted-foreground">#{payload[0].payload.index}</div>
                        <div className="font-mono tnum">WR {formatPct(payload[0].value, 1)}</div>
                      </div>
                    ) : null
                  }
                />
                <Area type="monotone" dataKey="winRate" stroke="var(--primary)" strokeWidth={2} fill="url(#rw)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Daily P/L</div>
            <div className="text-xs text-muted-foreground">Last 60 trading days</div>
          </div>
          <div className="h-60 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days.slice(-60)} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <Tooltip content={<CurrencyTooltip currency={currency} />} cursor={{ fill: "var(--secondary)", opacity: 0.4 }} />
                <Bar dataKey="profit" radius={[2, 2, 0, 0]}>
                  {days.slice(-60).map((d, i) => (
                    <Cell key={i} fill={d.profit >= 0 ? "var(--primary)" : "var(--destructive)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Yearly recap table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-medium">Yearly recap</div>
          <div className="text-xs text-muted-foreground">Performance per calendar year</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background/60 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Year</th>
                <th className="px-4 py-2 font-medium">Trades</th>
                <th className="px-4 py-2 font-medium">Wins</th>
                <th className="px-4 py-2 font-medium">Win rate</th>
                <th className="px-4 py-2 text-right font-medium">Net P/L</th>
              </tr>
            </thead>
            <tbody>
              {yearly.map((y) => (
                <tr key={y.year} className="border-t border-border">
                  <td className="px-4 py-2 font-mono">{y.year}</td>
                  <td className="px-4 py-2 font-mono tnum">{y.trades}</td>
                  <td className="px-4 py-2 font-mono tnum">{y.wins}</td>
                  <td className="px-4 py-2 font-mono tnum">{formatPct(y.trades ? y.wins / y.trades : 0, 1)}</td>
                  <td className={`px-4 py-2 text-right font-mono tnum ${y.profit >= 0 ? "text-primary" : "text-destructive"}`}>
                    {y.profit >= 0 ? "+" : ""}
                    {formatCurrency(y.profit, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "profit" | "loss" | "accent" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-mono text-xl tnum ${
          tone === "profit" ? "text-primary" : tone === "loss" ? "text-destructive" : tone === "accent" ? "text-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function CurrencyTooltip({ active, payload, label, currency = "USD" }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label !== undefined && <div className="font-mono text-muted-foreground">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="mt-1 flex items-center gap-3 font-mono tnum">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.stroke || p.fill }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="text-foreground">{formatCurrency(Number(p.value), currency)}</span>
        </div>
      ))}
    </div>
  )
}
