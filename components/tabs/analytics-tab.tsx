"use client"

import { useMemo } from "react"
import { useStatement } from "@/lib/store"
import {
  dayOfWeekStats,
  durationBuckets,
  formatCompact,
  formatCurrency,
  formatPct,
  hourlyStats,
  profitDistribution,
  typeStats,
} from "@/lib/analytics"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"

export function AnalyticsTab() {
  const { statement, breakevenTickets } = useStatement()
  if (!statement) return null
  const currency = statement.account.currency
  const trades = statement.trades
  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])

  const hourly = useMemo(() => hourlyStats(trades, breakevenSet), [trades, breakevenSet])
  const dow = useMemo(() => dayOfWeekStats(trades, breakevenSet), [trades, breakevenSet])
  const types = useMemo(() => typeStats(trades, breakevenSet), [trades, breakevenSet])
  const durations = useMemo(() => durationBuckets(trades, breakevenSet), [trades, breakevenSet])
  const dist = useMemo(() => profitDistribution(trades, 24, breakevenSet), [trades, breakevenSet])

  // Scatter: size vs profit
  const scatter = trades.map((t) => ({
    size: t.size,
    profit: t.profit + t.commission + t.swap,
    ticket: t.ticket,
    type: t.type,
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Hour of day" subtitle="Open time — local browser timezone">
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourly} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="l"
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <YAxis
                  yAxisId="r"
                  orientation="right"
                  stroke="var(--accent)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip content={<TT currency={currency} />} cursor={{ fill: "var(--secondary)", opacity: 0.3 }} />
                <Bar yAxisId="l" dataKey="profit" name="P/L" radius={[3, 3, 0, 0]}>
                  {hourly.map((h, i) => (
                    <Cell key={i} fill={h.profit >= 0 ? "var(--primary)" : "var(--destructive)"} />
                  ))}
                </Bar>
                <Line yAxisId="r" type="monotone" dataKey="trades" name="trades" stroke="var(--accent)" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Day of week" subtitle="Open time — local browser timezone">
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dow} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="l"
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <YAxis yAxisId="r" orientation="right" stroke="var(--accent)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip content={<TT currency={currency} />} cursor={{ fill: "var(--secondary)", opacity: 0.3 }} />
                <Bar yAxisId="l" dataKey="profit" name="P/L" radius={[4, 4, 0, 0]}>
                  {dow.map((d, i) => (
                    <Cell key={i} fill={d.profit >= 0 ? "var(--primary)" : "var(--destructive)"} />
                  ))}
                </Bar>
                <Line yAxisId="r" type="monotone" dataKey="trades" name="trades" stroke="var(--accent)" dot={{ r: 3 }} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Type + duration buckets */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Buy vs Sell" subtitle="Direction performance">
          <div className="space-y-3 p-4">
            {types.map((t) => (
              <div key={t.type} className="rounded-md border border-border bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-5 items-center rounded border px-1.5 font-mono text-[10px] uppercase ${
                        t.type === "buy" ? "border-primary/40 bg-primary/10 text-primary" : "border-destructive/40 bg-destructive/10 text-destructive"
                      }`}
                    >
                      {t.type}
                    </span>
                    <span className="text-sm font-medium">{t.trades} trades</span>
                  </div>
                  <div className={`font-mono tnum ${t.profit >= 0 ? "text-primary" : "text-destructive"}`}>
                    {t.profit >= 0 ? "+" : ""}
                    {formatCompact(t.profit, currency)}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Win rate</span>
                  <span className="font-mono tnum text-foreground">{formatPct(t.winRate, 1)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full ${t.winRate >= 0.5 ? "bg-primary" : "bg-destructive"}`}
                    style={{ width: `${Math.max(3, t.winRate * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Trade duration" subtitle="Time in market buckets" className="xl:col-span-2">
          <div className="h-64 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={durations} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="l"
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <YAxis yAxisId="r" orientation="right" stroke="var(--accent)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip content={<TT currency={currency} />} cursor={{ fill: "var(--secondary)", opacity: 0.3 }} />
                <Bar yAxisId="l" dataKey="profit" name="P/L" radius={[4, 4, 0, 0]}>
                  {durations.map((d, i) => (
                    <Cell key={i} fill={d.profit >= 0 ? "var(--primary)" : "var(--destructive)"} />
                  ))}
                </Bar>
                <Line yAxisId="r" type="monotone" dataKey="trades" name="trades" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Distribution + Scatter */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Profit distribution" subtitle="Histogram of net P/L per trade">
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dist} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.[0] ? (
                      <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                        <div className="font-mono text-muted-foreground">{payload[0].payload.label}</div>
                        <div className="font-mono tnum">{payload[0].value} trades</div>
                      </div>
                    ) : null
                  }
                  cursor={{ fill: "var(--secondary)", opacity: 0.3 }}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {dist.map((b, i) => (
                    <Cell key={i} fill={b.to <= 0 ? "var(--destructive)" : b.from >= 0 ? "var(--primary)" : "var(--muted-foreground)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Size vs P/L" subtitle="Each dot is one trade · color by direction">
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="size"
                  name="lots"
                  stroke="var(--muted-foreground)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="number"
                  dataKey="profit"
                  name="P/L"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  stroke="var(--muted-foreground)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <ZAxis range={[40, 40]} />
                <Tooltip
                  content={({ active, payload }: any) =>
                    active && payload?.[0] ? (
                      <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                        <div className="font-mono text-muted-foreground">#{payload[0].payload.ticket} · {payload[0].payload.type}</div>
                        <div className="font-mono tnum">size {payload[0].payload.size}</div>
                        <div className="font-mono tnum">
                          P/L {formatCurrency(payload[0].payload.profit, currency)}
                        </div>
                      </div>
                    ) : null
                  }
                />
                <Scatter data={scatter.filter((s) => s.type === "buy")} fill="var(--primary)" fillOpacity={0.6} />
                <Scatter data={scatter.filter((s) => s.type === "sell")} fill="var(--destructive)" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-card ${className ?? ""}`}>
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-medium">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function TT({ active, payload, label, currency = "USD" }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
      {label && <div className="font-mono text-muted-foreground">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="mt-1 flex items-center gap-2 font-mono tnum">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill || p.stroke }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="text-foreground">
            {p.name === "trades" ? p.value : formatCurrency(Number(p.value), currency)}
          </span>
        </div>
      ))}
    </div>
  )
}
