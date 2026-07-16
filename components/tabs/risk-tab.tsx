"use client"

import { useMemo } from "react"
import { useStatement } from "@/lib/store"
import { buildEquityCurve, computeKPI, formatCompact, formatCurrency, formatPct } from "@/lib/analytics"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"

export function RiskTab() {
  const { statement, breakevenTickets } = useStatement()
  if (!statement) return null
  const currency = statement.account.currency
  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])
  const kpi = useMemo(() => computeKPI(statement, breakevenSet), [statement, breakevenSet])
  const equity = useMemo(() => buildEquityCurve(statement), [statement])
  const dd = equity.map((p, i) => ({ i, drawdown: -p.drawdown, ddPct: -p.drawdownPct }))

  const metrics: Array<{ label: string; value: string; hint?: string; tone?: "profit" | "loss" | "accent"; bar?: number }> = [
    {
      label: "Sharpe ratio (trade)",
      value: kpi.sharpe.toFixed(3),
      hint: "Mean return / stdev × √N",
      tone: kpi.sharpe >= 1 ? "profit" : kpi.sharpe >= 0 ? undefined : "loss",
      bar: Math.min(1, Math.max(0, kpi.sharpe / 3)),
    },
    {
      label: "Sortino ratio",
      value: kpi.sortino.toFixed(3),
      hint: "Downside-risk adjusted",
      tone: kpi.sortino >= 1 ? "profit" : kpi.sortino >= 0 ? undefined : "loss",
      bar: Math.min(1, Math.max(0, kpi.sortino / 3)),
    },
    {
      label: "Profit factor",
      value: Number.isFinite(kpi.profitFactor) ? kpi.profitFactor.toFixed(2) : "∞",
      hint: "Gross profit / gross loss",
      tone: kpi.profitFactor >= 1 ? "profit" : "loss",
      bar: Math.min(1, Math.max(0, kpi.profitFactor / 3)),
    },
    {
      label: "Expectancy / trade",
      value: formatCurrency(kpi.expectancy, currency),
      hint: "Net P/L per trade",
      tone: kpi.expectancy >= 0 ? "profit" : "loss",
    },
    {
      label: "Payoff ratio",
      value: kpi.payoffRatio.toFixed(2),
      hint: "avg win / |avg loss|",
      tone: kpi.payoffRatio >= 1 ? "profit" : "loss",
      bar: Math.min(1, Math.max(0, kpi.payoffRatio / 4)),
    },
    {
      label: "Kelly criterion",
      value: formatPct(kpi.kellyPct, 1),
      hint: "Optimal risk per trade",
      tone: kpi.kellyPct > 0 ? "profit" : "loss",
      bar: Math.min(1, Math.max(0, kpi.kellyPct)),
    },
    {
      label: "Avg R-multiple",
      value: kpi.avgRMultiple.toFixed(2) + "R",
      hint: "Relative to SL-based risk",
      tone: kpi.avgRMultiple >= 0 ? "profit" : "loss",
    },
    {
      label: "Recovery factor",
      value: Number.isFinite(kpi.recoveryFactor) ? kpi.recoveryFactor.toFixed(2) : "∞",
      hint: "Net profit / max drawdown",
      tone: kpi.recoveryFactor >= 1 ? "profit" : undefined,
      bar: Math.min(1, Math.max(0, kpi.recoveryFactor / 10)),
    },
    {
      label: "Max drawdown",
      value: formatCompact(kpi.maxDrawdown, currency),
      hint: `${kpi.maxDrawdownPct.toFixed(2)}% peak-to-trough`,
      tone: "loss",
    },
    {
      label: "Win rate",
      value: formatPct(kpi.winRate, 2),
      hint: `${kpi.wins}W · ${kpi.losses}L`,
      tone: kpi.winRate >= 0.5 ? "profit" : undefined,
      bar: kpi.winRate,
    },
    {
      label: "Avg trade duration",
      value: formatDuration(kpi.avgTradeDurationMin),
      hint: "Time in market",
    },
    {
      label: "Total volume",
      value: `${kpi.totalVolume.toFixed(2)} lots`,
      hint: `${kpi.totalTrades} trades`,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
                <div
                  className={cn(
                    "mt-1 font-mono text-2xl tnum truncate",
                    m.tone === "profit" && "text-primary",
                    m.tone === "loss" && "text-destructive",
                    m.tone === "accent" && "text-accent",
                  )}
                  title={m.value}
                >
                  {m.value}
                </div>
                {m.hint && <div className="text-xs text-muted-foreground">{m.hint}</div>}
              </div>
            </div>
            {m.bar !== undefined && (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full",
                    m.tone === "loss" ? "bg-destructive" : "bg-primary",
                  )}
                  style={{ width: `${m.bar * 100}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="text-sm font-medium">Drawdown (%) underwater</div>
          <div className="text-xs text-muted-foreground">Percentage drop from running peak</div>
        </div>
        <div className="h-72 w-full p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dd} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ddp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0} />
                  <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="i" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                stroke="var(--muted-foreground)"
                tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                content={({ active, payload }: any) =>
                  active && payload?.[0] ? (
                    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                      <div className="font-mono text-muted-foreground">#{payload[0].payload.i}</div>
                      <div className="font-mono tnum text-destructive">
                        {payload[0].payload.ddPct.toFixed(2)}%
                      </div>
                    </div>
                  ) : null
                }
              />
              <Area dataKey="ddPct" type="monotone" stroke="var(--destructive)" strokeWidth={2} fill="url(#ddp)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function formatDuration(min: number) {
  if (!Number.isFinite(min) || min <= 0) return "—"
  if (min < 60) return `${min.toFixed(0)}m`
  if (min < 60 * 24) return `${(min / 60).toFixed(1)}h`
  return `${(min / (60 * 24)).toFixed(1)}d`
}
