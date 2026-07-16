"use client"

import { useMemo } from "react"
import { useStatement } from "@/lib/store"
import { formatCompact, formatCurrency, formatPct, rollingWinRate } from "@/lib/analytics"
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
import { Flame, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react"

interface Streak {
  type: "win" | "loss"
  length: number
  profit: number
  startTicket: number
  endTicket: number
  startTime: Date
  endTime: Date
}

export function StreaksTab() {
  const { statement, breakevenTickets } = useStatement()
  if (!statement) return null
  const currency = statement.account.currency
  const trades = statement.trades
  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])

  const streaks = useMemo<Streak[]>(() => {
    const out: Streak[] = []
    let cur: Streak | null = null
    for (const t of trades) {
      if (breakevenSet.has(t.ticket)) continue
      const res = t.profit > 0 ? "win" : t.profit < 0 ? "loss" : null
      const profit = t.profit + t.commission + t.swap
      if (!res) continue
      if (!cur || cur.type !== res) {
        if (cur) out.push(cur)
        cur = {
          type: res,
          length: 1,
          profit,
          startTicket: t.ticket,
          endTicket: t.ticket,
          startTime: t.openTime,
          endTime: t.closeTime,
        }
      } else {
        cur.length += 1
        cur.profit += profit
        cur.endTicket = t.ticket
        cur.endTime = t.closeTime
      }
    }
    if (cur) out.push(cur)
    return out
  }, [trades, breakevenSet])

  const longestWin = streaks.filter((s) => s.type === "win").sort((a, b) => b.length - a.length)[0]
  const longestLoss = streaks.filter((s) => s.type === "loss").sort((a, b) => b.length - a.length)[0]
  const avgWinLen = avg(streaks.filter((s) => s.type === "win").map((s) => s.length))
  const avgLossLen = avg(streaks.filter((s) => s.type === "loss").map((s) => s.length))

  const rolling = useMemo(() => rollingWinRate(trades, 20, breakevenSet), [trades, breakevenSet])

  // Current streak
  const current = streaks[streaks.length - 1]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Box
          icon={Flame}
          title="Longest win streak"
          value={`${longestWin?.length ?? 0} trades`}
          hint={longestWin ? `+${formatCompact(longestWin.profit, currency)}` : undefined}
          tone="profit"
        />
        <Box
          icon={ShieldAlert}
          title="Longest loss streak"
          value={`${longestLoss?.length ?? 0} trades`}
          hint={longestLoss ? formatCompact(longestLoss.profit, currency) : undefined}
          tone="loss"
        />
        <Box
          icon={TrendingUp}
          title="Avg win streak"
          value={avgWinLen.toFixed(2)}
          hint="consecutive winners"
        />
        <Box
          icon={TrendingDown}
          title="Avg loss streak"
          value={avgLossLen.toFixed(2)}
          hint="consecutive losers"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-border bg-card xl:col-span-2">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Trade-by-trade streaks</div>
            <div className="text-xs text-muted-foreground">
              Wins above axis · losses below · bar width proportional to length
            </div>
          </div>
          <div className="p-3">
            <div className="flex items-center gap-[2px]">
              {streaks.map((s, i) => {
                const h = Math.min(80, 20 + s.length * 4)
                return (
                  <div
                    key={i}
                    className="group relative flex items-end"
                    title={`${s.type === "win" ? "Win" : "Loss"} streak · ${s.length} trades · ${formatCurrency(s.profit, currency)}`}
                  >
                    <div
                      className={cn(
                        "w-2 rounded-sm transition-transform group-hover:scale-y-110",
                        s.type === "win" ? "bg-primary" : "bg-destructive",
                      )}
                      style={{
                        height: `${h}px`,
                        transform: s.type === "loss" ? "translateY(0)" : undefined,
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto thin-scroll border-t border-border">
            <table className="w-full text-sm">
              <thead className="bg-background/60 text-left">
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Length</th>
                  <th className="px-4 py-2">Tickets</th>
                  <th className="px-4 py-2">Span</th>
                  <th className="px-4 py-2 text-right">Net P/L</th>
                </tr>
              </thead>
              <tbody>
                {[...streaks].sort((a, b) => b.length - a.length).slice(0, 30).map((s, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-flex h-5 items-center rounded border px-1.5 font-mono text-[10px] uppercase",
                          s.type === "win"
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-destructive/40 bg-destructive/10 text-destructive",
                        )}
                      >
                        {s.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono tnum">{s.length}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      #{s.startTicket} → #{s.endTicket}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {s.startTime.toLocaleDateString()} – {s.endTime.toLocaleDateString()}
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

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-medium">Current run</div>
            <div className="mt-2 text-xs text-muted-foreground">Most recent streak</div>
            {current ? (
              <div className="mt-4">
                <div
                  className={cn(
                    "inline-flex h-6 items-center rounded border px-2 font-mono text-xs uppercase",
                    current.type === "win"
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-destructive/40 bg-destructive/10 text-destructive",
                  )}
                >
                  {current.type}
                </div>
                <div className="mt-3 font-mono text-3xl tnum">
                  {current.length} <span className="text-sm text-muted-foreground">in a row</span>
                </div>
                <div
                  className={cn(
                    "mt-1 font-mono tnum",
                    current.profit >= 0 ? "text-primary" : "text-destructive",
                  )}
                >
                  {current.profit >= 0 ? "+" : ""}
                  {formatCurrency(current.profit, currency)}
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">No trades yet</div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <div className="text-sm font-medium">Rolling win rate</div>
              <div className="text-xs text-muted-foreground">20-trade window</div>
            </div>
            <div className="h-48 w-full p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rolling} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rws" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="index" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 1]} tickFormatter={(v) => formatPct(Number(v), 0)} stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    content={({ active, payload }: any) =>
                      active && payload?.[0] ? (
                        <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                          <div className="font-mono">#{payload[0].payload.index}</div>
                          <div className="font-mono tnum">{formatPct(payload[0].value, 1)}</div>
                        </div>
                      ) : null
                    }
                  />
                  <Area dataKey="winRate" stroke="var(--primary)" strokeWidth={2} fill="url(#rws)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function avg(arr: number[]) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function Box({
  icon: Icon,
  title,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  value: string
  hint?: string
  tone?: "profit" | "loss"
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</div>
          <div
            className={cn(
              "mt-1 font-mono text-2xl tnum",
              tone === "profit" && "text-primary",
              tone === "loss" && "text-destructive",
            )}
          >
            {value}
          </div>
          {hint && <div className="font-mono text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md ring-1",
            tone === "profit" && "bg-primary/10 text-primary ring-primary/30",
            tone === "loss" && "bg-destructive/10 text-destructive ring-destructive/30",
            !tone && "bg-muted text-muted-foreground ring-border",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}
