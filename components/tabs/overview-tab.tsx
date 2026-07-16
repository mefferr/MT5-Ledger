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
  typeStats,
} from "@/lib/analytics"
import { KpiCard } from "@/components/kpi-card"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Crown,
  Flame,
  Percent,
  Scale,
  Sigma,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"

export function OverviewTab() {
  const { statement, breakevenTickets } = useStatement()
  if (!statement) return null
  const currency = statement.account.currency

  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])

  const kpi = useMemo(() => computeKPI(statement, breakevenSet), [statement, breakevenSet])
  const equity = useMemo(() => buildEquityCurve(statement), [statement])
  const months = useMemo(() => monthlyStats(statement.trades, breakevenSet), [statement, breakevenSet])
  const types = useMemo(() => typeStats(statement.trades, breakevenSet), [statement, breakevenSet])
  const days = useMemo(() => dailyStats(statement.trades, breakevenSet), [statement, breakevenSet])

  const equityData = equity.map((p, i) => ({
    i,
    balance: p.balance,
    peak: p.peak,
    drawdown: -p.drawdown,
    time: p.time,
  }))

  const best = [...statement.trades].sort((a, b) => b.profit - a.profit).slice(0, 5)
  const worst = [...statement.trades].sort((a, b) => a.profit - b.profit).slice(0, 5)

  const lastDay = days[days.length - 1]
  const pfLabel = Number.isFinite(kpi.profitFactor)
    ? kpi.profitFactor.toFixed(2)
    : "∞"

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard
          label="Net P/L"
          value={formatCompact(kpi.netProfit, currency)}
          hint={kpi.netProfit >= 0 ? "All-time profit" : "All-time loss"}
          icon={kpi.netProfit >= 0 ? TrendingUp : TrendingDown}
          tone={kpi.netProfit >= 0 ? "profit" : "loss"}
          delta={`ROI ${formatPct(kpi.roi, 1)}`}
          deltaTone={kpi.roi >= 0 ? "profit" : "loss"}
        />
        <KpiCard
          label="Balance"
          value={formatCompact(kpi.finalBalance, currency)}
          hint={`From ${formatCompact(kpi.initialDeposit, currency)} deposit`}
          icon={Wallet}
          tone="accent"
        />
        <KpiCard
          label="Win Rate"
          value={formatPct(kpi.winRate, 1)}
          hint={`${kpi.wins}W / ${kpi.losses}L / ${kpi.breakeven}BE`}
          icon={Percent}
          tone={kpi.winRate >= 0.5 ? "profit" : "default"}
        />
        <KpiCard
          label="Profit Factor"
          value={pfLabel}
          hint={`GP ${formatCompact(kpi.grossProfit, currency)} / GL ${formatCompact(Math.abs(kpi.grossLoss), currency)}`}
          icon={Scale}
          tone={kpi.profitFactor >= 1 ? "profit" : "loss"}
        />
        <KpiCard
          label="Max Drawdown"
          value={formatCompact(kpi.maxDrawdown, currency)}
          hint={`${formatPct(kpi.maxDrawdownPct / 100, 2)} peak-to-trough`}
          icon={ArrowDownRight}
          tone="loss"
        />
        <KpiCard
          label="Expectancy"
          value={formatCompact(kpi.expectancy, currency)}
          hint={`Per trade · ${kpi.totalTrades} trades`}
          icon={Sigma}
          tone={kpi.expectancy >= 0 ? "profit" : "loss"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard
          label="Avg Win"
          value={formatCompact(kpi.avgWin, currency)}
          hint={breakevenTickets.length > 0 ? `Excl. ${breakevenTickets.length} BE` : undefined}
          icon={ArrowUpRight}
          tone="profit"
        />
        <KpiCard
          label="Avg Loss"
          value={formatCompact(kpi.avgLoss, currency)}
          hint={breakevenTickets.length > 0 ? `Excl. ${breakevenTickets.length} BE` : undefined}
          icon={ArrowDownRight}
          tone="loss"
        />
        <KpiCard
          label="Largest Win"
          value={formatCompact(kpi.largestWin, currency)}
          icon={Trophy}
          tone="profit"
        />
        <KpiCard
          label="Largest Loss"
          value={formatCompact(kpi.largestLoss, currency)}
          icon={Zap}
          tone="loss"
        />
        <KpiCard
          label="Payoff Ratio"
          value={kpi.payoffRatio.toFixed(2)}
          hint="avg win / avg loss"
          icon={Crown}
          tone={kpi.payoffRatio >= 1 ? "profit" : "default"}
        />
        <KpiCard
          label="Trades"
          value={kpi.totalTrades.toLocaleString()}
          hint={`${kpi.totalVolume.toFixed(2)} total lots`}
          icon={CircleDollarSign}
        />
      </div>

      {/* Equity + donut row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="col-span-1 overflow-hidden rounded-xl border border-border bg-card xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-medium">Equity curve</div>
              <div className="text-xs text-muted-foreground">
                Balance over {equity.length} events · peak {formatCompact(kpi.peakBalance, currency)}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <Legend dot="bg-primary" label="Balance" />
              <Legend dot="bg-accent" label="Peak" />
            </div>
          </div>
          <div className="h-72 w-full p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="i"
                  tickFormatter={(v) => `#${v}`}
                  stroke="var(--muted-foreground)"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatCompact(Number(v), currency)}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <Tooltip content={<EquityTooltip currency={currency} />} cursor={{ stroke: "var(--border)" }} />
                <Area type="monotone" dataKey="peak" stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" fill="transparent" />
                <Area type="monotone" dataKey="balance" stroke="var(--primary)" strokeWidth={2} fill="url(#eq)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Win / Loss split</div>
            <div className="text-xs text-muted-foreground">{kpi.totalTrades} closed trades</div>
          </div>
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Wins", value: kpi.wins, color: "var(--primary)" },
                      { name: "Losses", value: kpi.losses, color: "var(--destructive)" },
                      { name: "BE", value: kpi.breakeven, color: "var(--muted-foreground)" },
                    ]}
                    dataKey="value"
                    innerRadius={44}
                    outerRadius={72}
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {[
                      "var(--primary)",
                      "var(--destructive)",
                      "var(--muted-foreground)",
                    ].map((c, i) => (
                      <Cell key={i} fill={c} />
                    ))}
                  </Pie>
                  <Tooltip content={<GenericTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center gap-2 text-sm">
              <SplitRow color="bg-primary" label="Wins" value={kpi.wins} pct={kpi.winRate} />
              <SplitRow color="bg-destructive" label="Losses" value={kpi.losses} pct={kpi.totalTrades ? kpi.losses / kpi.totalTrades : 0} />
              <SplitRow color="bg-muted-foreground" label="Breakeven" value={kpi.breakeven} pct={kpi.totalTrades ? kpi.breakeven / kpi.totalTrades : 0} />
              <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Buy trades</span>
                  <span className="font-mono tnum">{types[0].trades} · {formatPct(types[0].winRate, 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Sell trades</span>
                  <span className="font-mono tnum">{types[1].trades} · {formatPct(types[1].winRate, 0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly bar + best/worst */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-border bg-card xl:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-medium">Monthly P/L</div>
              <div className="text-xs text-muted-foreground">{months.length} months of activity</div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <Legend dot="bg-primary" label="Profit" />
              <Legend dot="bg-destructive" label="Loss" />
            </div>
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
                <Tooltip content={<GenericTooltip currency={currency} />} cursor={{ fill: "var(--secondary)", opacity: 0.4 }} />
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
            <div className="text-sm font-medium">Best & worst trades</div>
            <div className="text-xs text-muted-foreground">Top 5 either side</div>
          </div>
          <div className="max-h-[280px] overflow-y-auto thin-scroll">
            <TradeMiniList trades={best} tone="profit" currency={currency} />
            <div className="border-t border-border" />
            <TradeMiniList trades={worst} tone="loss" currency={currency} />
          </div>
        </div>
      </div>

      {/* Footer stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard
          label="Sharpe (trade)"
          value={kpi.sharpe.toFixed(2)}
          icon={Sigma}
          tone={kpi.sharpe >= 1 ? "profit" : "default"}
        />
        <KpiCard
          label="Sortino"
          value={kpi.sortino.toFixed(2)}
          icon={Sigma}
          tone={kpi.sortino >= 1 ? "profit" : "default"}
        />
        <KpiCard
          label="Recovery"
          value={Number.isFinite(kpi.recoveryFactor) ? kpi.recoveryFactor.toFixed(2) : "∞"}
          hint="net / maxDD"
          icon={Flame}
        />
        <KpiCard label="Kelly %" value={formatPct(kpi.kellyPct, 1)} icon={Percent} />
        <KpiCard
          label="Avg R"
          value={kpi.avgRMultiple.toFixed(2) + "R"}
          icon={Banknote}
          tone={kpi.avgRMultiple >= 0 ? "profit" : "loss"}
        />
        <KpiCard
          label="Last day P/L"
          value={lastDay ? formatCompact(lastDay.profit, currency) : "—"}
          hint={lastDay?.date}
          icon={lastDay && lastDay.profit >= 0 ? TrendingUp : TrendingDown}
          tone={lastDay ? (lastDay.profit >= 0 ? "profit" : "loss") : "default"}
        />
      </div>
    </div>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {label}
    </span>
  )
}

function SplitRow({ color, label, value, pct }: { color: string; label: string; value: number; pct: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", color)} />
        <span>{label}</span>
      </div>
      <div className="font-mono text-xs tnum text-muted-foreground">
        <span className="mr-2 text-foreground">{value}</span>
        {formatPct(pct, 1)}
      </div>
    </div>
  )
}

function TradeMiniList({
  trades,
  tone,
  currency,
}: {
  trades: { ticket: number; profit: number; symbol: string; closeTime: Date; type: string }[]
  tone: "profit" | "loss"
  currency: string
}) {
  return (
    <ul>
      {trades.map((t) => (
        <li key={t.ticket} className="flex items-center justify-between px-4 py-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "inline-flex h-5 items-center rounded border px-1.5 font-mono text-[10px] uppercase",
                t.type === "buy"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {t.type}
            </span>
            <span className="font-mono text-xs text-muted-foreground">#{t.ticket}</span>
            <span className="truncate">{t.symbol}</span>
          </div>
          <div
            className={cn(
              "font-mono text-sm tnum",
              tone === "profit" ? "text-primary" : "text-destructive",
            )}
          >
            {t.profit >= 0 ? "+" : ""}
            {formatCompact(t.profit, currency)}
          </div>
        </li>
      ))}
    </ul>
  )
}

function EquityTooltip({ active, payload, currency }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="font-mono text-muted-foreground">#{p.i}</div>
      <div className="mt-1 font-mono tnum">
        Balance <span className="ml-2 text-primary">{formatCurrency(p.balance, currency)}</span>
      </div>
      <div className="font-mono tnum">
        Peak <span className="ml-2 text-accent">{formatCurrency(p.peak, currency)}</span>
      </div>
      <div className="font-mono tnum">
        DD <span className="ml-2 text-destructive">{formatCurrency(p.drawdown, currency)}</span>
      </div>
    </div>
  )
}

function GenericTooltip({ active, payload, label, currency = "USD" }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label && <div className="font-mono text-muted-foreground">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="mt-1 flex items-center gap-3 font-mono tnum">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="text-foreground">
            {typeof p.value === "number"
              ? currency
                ? formatCompact(p.value, currency)
                : p.value.toLocaleString()
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}
