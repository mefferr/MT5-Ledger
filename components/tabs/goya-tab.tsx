"use client"

import { useMemo, useState } from "react"
import { useStatement } from "@/lib/store"
import { computeKPI, buildEquityCurve, formatCurrency, formatPct, monthlyStats } from "@/lib/analytics"
import type { Trade, ParsedStatement } from "@/lib/types"
import type { KPI } from "@/lib/analytics"
import { cn } from "@/lib/utils"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts"
import {
  Crosshair,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Calculator,
  Layers,
  Zap,
  Target,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  BarChart3,
  Trophy,
  Building2,
  Receipt,
  Banknote,
  PiggyBank,
  Percent,
  Activity,
  ChevronDown,
  Scale,
  Gauge,
  Clock,
  Flame,
  Info,
} from "lucide-react"

/* ═══════════════════════════════════════════════════════════
   PIP UTILITIES
   ═══════════════════════════════════════════════════════════ */

/** Guess pip size from symbol name. Gold/indices use 0.1 or 1, JPY pairs 0.01, most FX 0.0001. */
function guessPipSize(symbol: string): number {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")
  // Gold
  if (s.includes("XAU") || s.includes("GOLD")) return 0.1
  // Silver
  if (s.includes("XAG") || s.includes("SILVER")) return 0.01
  // JPY pairs
  if (s.includes("JPY")) return 0.01
  // Indices
  if (
    s.includes("US30") || s.includes("NAS") || s.includes("SPX") ||
    s.includes("US500") || s.includes("US100") || s.includes("DAX") ||
    s.includes("GER") || s.includes("UK100") || s.includes("JPN")
  ) return 1
  // Oil
  if (s.includes("WTI") || s.includes("OIL") || s.includes("BRENT") || s.includes("UKOIL") || s.includes("USOIL")) return 0.01
  // Crypto
  if (s.includes("BTC") || s.includes("ETH")) return 1
  // Standard FX
  return 0.0001
}

/** Calculate pips for a single trade (signed: positive = profitable direction). */
function tradePips(t: Trade): number {
  const pipSize = guessPipSize(t.symbol)
  const rawDiff = t.type === "buy"
    ? t.closePrice - t.openPrice
    : t.openPrice - t.closePrice
  return rawDiff / pipSize
}

/** SL distance in pips (always positive). */
function slPips(t: Trade): number {
  if (!t.sl || t.sl === 0) return 0
  const pipSize = guessPipSize(t.symbol)
  return Math.abs(t.openPrice - t.sl) / pipSize
}

/** TP distance in pips (always positive). */
function tpPips(t: Trade): number {
  if (!t.tp || t.tp === 0) return 0
  const pipSize = guessPipSize(t.symbol)
  return Math.abs(t.tp - t.openPrice) / pipSize
}

/* ═══════════════════════════════════════════════════════════
   GOYA ANALYTICS ENGINE
   ═══════════════════════════════════════════════════════════ */

interface GoyaMetrics {
  // ─── Pip Extraction ───
  totalPipsExtracted: number       // sum of pips on winning trades
  totalPipsLost: number            // sum of |pips| on losing trades
  netPips: number                  // total signed pips
  aggregatePips: number            // sum of |pips| per ticket (all tickets)
  avgPipsPerWin: number
  avgPipsPerLoss: number
  avgPipsPerTrade: number
  largestPipWin: number
  largestPipLoss: number
  medianPipsPerTrade: number

  // ─── Business P&L ───
  grossRevenue: number             // sum of winning trade profits
  businessExpenses: number         // sum of |losing trade profits|
  operatingCosts: number           // commissions + swaps
  netBusinessIncome: number        // revenue - expenses - operating costs
  expenseRatio: number             // expenses / revenue
  profitMargin: number             // net income / revenue
  costPerProbe: number             // avg loss (the "probe cost")
  revenuePerCampaign: number       // avg win
  roiOnExpenses: number            // net income / total expenses

  // ─── Asymmetry Metrics ───
  riskRewardRealized: number       // avg win pips / avg loss pips
  riskRewardPlanned: number        // avg TP distance / avg SL distance
  asymmetryScore: number           // realized R:R * payoff ratio
  edgeMultiplier: number           // how much each $1 of risk returns

  // ─── Campaign Detection ───
  campaigns: Campaign[]
  totalCampaigns: number
  winningCampaigns: number
  losingCampaigns: number
  campaignWinRate: number
  avgCampaignPips: number
  bestCampaignPips: number
  worstCampaignPips: number
  avgTicketsPerCampaign: number

  // ─── Streak & Endurance ───
  maxConsecLosses: number
  maxConsecWins: number
  maxDrawdownPips: number
  longestLossStreakCost: number    // $ cost of the longest loss streak
  recoveryTradesAfterMaxDD: number

  // ─── Pip Velocity ───
  tradingDays: number
  pipsPerDay: number
  pipsPerWeek: number
  pipsPerMonth: number
  tradesPerDay: number

  // ─── Per-trade data ───
  tradesPipData: TradePipRow[]

  // ─── Monthly pip data ───
  monthlyPipData: MonthlyPipRow[]

  // ─── Cumulative pip curve ───
  pipCurve: Array<{ index: number; cumPips: number; ticket: number }>

  // ─── Win amount distribution buckets ───
  pipDistribution: Array<{ range: string; count: number; isPositive: boolean }>
}

interface Campaign {
  trades: Trade[]
  pips: number
  profit: number
  ticketCount: number
  symbol: string
  startTime: Date
  endTime: Date
  isWin: boolean
}

interface TradePipRow {
  ticket: number
  symbol: string
  type: string
  pips: number
  slPips: number
  tpPips: number
  rMultiple: number
  profit: number
  size: number
}

interface MonthlyPipRow {
  key: string
  label: string
  pipsWon: number
  pipsLost: number
  netPips: number
  trades: number
  wins: number
  expenses: number   // $ lost
  revenue: number    // $ won
  netIncome: number
}

function computeGoyaMetrics(statement: ParsedStatement, kpi: KPI, breakevenTickets: Set<number>): GoyaMetrics {
  const trades = statement.trades
  const currency = statement.account.currency

  // ─── Per-trade pip calculations ───
  const pipsArr = trades.map(t => tradePips(t))
  const absPips = pipsArr.map(p => Math.abs(p))
  const winTrades = trades.filter(t => t.profit > 0 && !breakevenTickets.has(t.ticket))
  const loseTrades = trades.filter(t => t.profit < 0 && !breakevenTickets.has(t.ticket))
  const winPips = winTrades.map(t => tradePips(t))
  const losePips = loseTrades.map(t => tradePips(t))

  const totalPipsExtracted = winPips.reduce((s, p) => s + p, 0)
  const totalPipsLost = losePips.reduce((s, p) => s + Math.abs(p), 0)
  const netPips = pipsArr.reduce((s, p) => s + p, 0)
  const aggregatePips = absPips.reduce((s, p) => s + p, 0)

  const avgPipsPerWin = winPips.length ? totalPipsExtracted / winPips.length : 0
  const avgPipsPerLoss = losePips.length ? totalPipsLost / losePips.length : 0
  const avgPipsPerTrade = pipsArr.length ? netPips / pipsArr.length : 0
  const largestPipWin = winPips.length ? Math.max(...winPips) : 0
  const largestPipLoss = losePips.length ? Math.max(...losePips.map(p => Math.abs(p))) : 0

  // Median
  const sorted = [...pipsArr].sort((a, b) => a - b)
  const medianPipsPerTrade = sorted.length
    ? sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]
    : 0

  // ─── Business P&L ───
  const grossRevenue = kpi.grossProfit
  const businessExpenses = Math.abs(kpi.grossLoss)
  const operatingCosts = Math.abs(kpi.totalCommission) + Math.abs(kpi.totalSwap)
  const netBusinessIncome = grossRevenue - businessExpenses - operatingCosts
  const expenseRatio = grossRevenue > 0 ? businessExpenses / grossRevenue : 0
  const profitMargin = grossRevenue > 0 ? netBusinessIncome / grossRevenue : 0
  const costPerProbe = loseTrades.length ? businessExpenses / loseTrades.length : 0
  const revenuePerCampaign = winTrades.length ? grossRevenue / winTrades.length : 0
  const totalCosts = businessExpenses + operatingCosts
  const roiOnExpenses = totalCosts > 0 ? netBusinessIncome / totalCosts : 0

  // ─── Asymmetry ───
  const riskRewardRealized = avgPipsPerLoss > 0 ? avgPipsPerWin / avgPipsPerLoss : 0

  const slDistances = trades.map(t => slPips(t)).filter(p => p > 0)
  const tpDistances = trades.map(t => tpPips(t)).filter(p => p > 0)
  const avgSL = slDistances.length ? slDistances.reduce((s, p) => s + p, 0) / slDistances.length : 0
  const avgTP = tpDistances.length ? tpDistances.reduce((s, p) => s + p, 0) / tpDistances.length : 0
  const riskRewardPlanned = avgSL > 0 ? avgTP / avgSL : 0

  const asymmetryScore = riskRewardRealized * kpi.payoffRatio
  const edgeMultiplier = businessExpenses > 0 ? grossRevenue / businessExpenses : 0

  // ─── Campaign Detection ───
  // Group overlapping trades on the same symbol that are within 4 hours of each other
  const campaigns = detectCampaigns(trades)
  const winCampaigns = campaigns.filter(c => c.isWin)
  const loseCampaigns = campaigns.filter(c => !c.isWin)
  const campaignPips = campaigns.map(c => c.pips)
  const avgCampaignPips = campaigns.length ? campaignPips.reduce((s, p) => s + p, 0) / campaigns.length : 0
  const bestCampaignPips = campaignPips.length ? Math.max(...campaignPips) : 0
  const worstCampaignPips = campaignPips.length ? Math.min(...campaignPips) : 0
  const avgTicketsPerCampaign = campaigns.length
    ? campaigns.reduce((s, c) => s + c.ticketCount, 0) / campaigns.length
    : 0

  // ─── Streak & Endurance ───
  let maxConsecLosses = 0
  let maxConsecWins = 0
  let curLoss = 0
  let curWin = 0
  let longestLossStreakCost = 0
  let currentStreakCost = 0
  for (const t of trades) {
    if (breakevenTickets.has(t.ticket)) continue
    if (t.profit < 0) {
      curLoss++
      curWin = 0
      currentStreakCost += Math.abs(t.profit)
      if (curLoss > maxConsecLosses) {
        maxConsecLosses = curLoss
        longestLossStreakCost = currentStreakCost
      }
    } else if (t.profit > 0) {
      curWin++
      curLoss = 0
      currentStreakCost = 0
      if (curWin > maxConsecWins) maxConsecWins = curWin
    } else {
      curLoss = 0
      curWin = 0
      currentStreakCost = 0
    }
  }

  // Max drawdown in pips
  let cumPips = 0
  let peakPips = 0
  let maxDrawdownPips = 0
  for (const p of pipsArr) {
    cumPips += p
    if (cumPips > peakPips) peakPips = cumPips
    const dd = peakPips - cumPips
    if (dd > maxDrawdownPips) maxDrawdownPips = dd
  }

  // Recovery trades after max DD
  const equity = buildEquityCurve(statement)
  let maxDDIdx = 0
  let maxDD = 0
  for (let i = 0; i < equity.length; i++) {
    if (equity[i].drawdown > maxDD) {
      maxDD = equity[i].drawdown
      maxDDIdx = i
    }
  }
  let recoveryIdx = equity.length
  const ddPeak = equity[maxDDIdx]?.peak ?? 0
  for (let i = maxDDIdx + 1; i < equity.length; i++) {
    if (equity[i].balance >= ddPeak) {
      recoveryIdx = i
      break
    }
  }
  const recoveryTradesAfterMaxDD = recoveryIdx - maxDDIdx

  // ─── Pip Velocity ───
  const timestamps = trades.map(t => t.closeTime.getTime()).filter(t => Number.isFinite(t) && t > 0)
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const totalMs = maxTime - minTime
  const tradingDays = totalMs > 0 ? totalMs / (1000 * 60 * 60 * 24) : 1
  const pipsPerDay = netPips / Math.max(tradingDays, 1)
  const pipsPerWeek = pipsPerDay * 5  // trading days
  const pipsPerMonth = pipsPerDay * 22 // avg trading days
  const tradesPerDay = trades.length / Math.max(tradingDays, 1)

  // ─── Per-trade pip data ───
  const tradesPipData: TradePipRow[] = trades.map(t => {
    const pips = tradePips(t)
    const sl = slPips(t)
    const rMult = sl > 0 ? pips / sl : 0
    return {
      ticket: t.ticket,
      symbol: t.symbol,
      type: t.type,
      pips: Math.round(pips * 10) / 10,
      slPips: Math.round(sl * 10) / 10,
      tpPips: Math.round(tpPips(t) * 10) / 10,
      rMultiple: Math.round(rMult * 100) / 100,
      profit: t.profit + t.commission + t.swap,
      size: t.size,
    }
  })

  // ─── Monthly pip data ───
  const mStats = monthlyStats(trades)
  const monthlyPipData: MonthlyPipRow[] = mStats.map(m => {
    const monthTrades = trades.filter(t => {
      const d = t.closeTime
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      return key === m.key
    })
    const mWinPips = monthTrades.filter(t => t.profit > 0 && !breakevenTickets.has(t.ticket)).reduce((s, t) => s + tradePips(t), 0)
    const mLosePips = monthTrades.filter(t => t.profit < 0 && !breakevenTickets.has(t.ticket)).reduce((s, t) => s + Math.abs(tradePips(t)), 0)
    const mRevenue = monthTrades.filter(t => t.profit > 0 && !breakevenTickets.has(t.ticket)).reduce((s, t) => s + t.profit, 0)
    const mExpense = monthTrades.filter(t => t.profit < 0 && !breakevenTickets.has(t.ticket)).reduce((s, t) => s + Math.abs(t.profit), 0)

    return {
      key: m.key,
      label: m.label,
      pipsWon: Math.round(mWinPips * 10) / 10,
      pipsLost: Math.round(mLosePips * 10) / 10,
      netPips: Math.round((mWinPips - mLosePips) * 10) / 10,
      trades: m.trades,
      wins: m.wins,
      expenses: mExpense,
      revenue: mRevenue,
      netIncome: mRevenue - mExpense,
    }
  })

  // ─── Cumulative pip curve ───
  let cum = 0
  const pipCurve = trades.map((t, i) => {
    cum += tradePips(t)
    return { index: i, cumPips: Math.round(cum * 10) / 10, ticket: t.ticket }
  })

  // ─── Pip distribution ───
  const pipBuckets = buildPipDistribution(pipsArr)

  return {
    totalPipsExtracted: Math.round(totalPipsExtracted * 10) / 10,
    totalPipsLost: Math.round(totalPipsLost * 10) / 10,
    netPips: Math.round(netPips * 10) / 10,
    aggregatePips: Math.round(aggregatePips * 10) / 10,
    avgPipsPerWin: Math.round(avgPipsPerWin * 10) / 10,
    avgPipsPerLoss: Math.round(avgPipsPerLoss * 10) / 10,
    avgPipsPerTrade: Math.round(avgPipsPerTrade * 10) / 10,
    largestPipWin: Math.round(largestPipWin * 10) / 10,
    largestPipLoss: Math.round(largestPipLoss * 10) / 10,
    medianPipsPerTrade: Math.round(medianPipsPerTrade * 10) / 10,
    grossRevenue,
    businessExpenses,
    operatingCosts,
    netBusinessIncome,
    expenseRatio,
    profitMargin,
    costPerProbe,
    revenuePerCampaign,
    roiOnExpenses,
    riskRewardRealized: Math.round(riskRewardRealized * 100) / 100,
    riskRewardPlanned: Math.round(riskRewardPlanned * 100) / 100,
    asymmetryScore: Math.round(asymmetryScore * 100) / 100,
    edgeMultiplier: Math.round(edgeMultiplier * 100) / 100,
    campaigns,
    totalCampaigns: campaigns.length,
    winningCampaigns: winCampaigns.length,
    losingCampaigns: loseCampaigns.length,
    campaignWinRate: campaigns.length ? winCampaigns.length / campaigns.length : 0,
    avgCampaignPips: Math.round(avgCampaignPips * 10) / 10,
    bestCampaignPips: Math.round(bestCampaignPips * 10) / 10,
    worstCampaignPips: Math.round(worstCampaignPips * 10) / 10,
    avgTicketsPerCampaign: Math.round(avgTicketsPerCampaign * 10) / 10,
    maxConsecLosses,
    maxConsecWins,
    maxDrawdownPips: Math.round(maxDrawdownPips * 10) / 10,
    longestLossStreakCost,
    recoveryTradesAfterMaxDD,
    tradingDays: Math.round(tradingDays),
    pipsPerDay: Math.round(pipsPerDay * 10) / 10,
    pipsPerWeek: Math.round(pipsPerWeek * 10) / 10,
    pipsPerMonth: Math.round(pipsPerMonth * 10) / 10,
    tradesPerDay: Math.round(tradesPerDay * 10) / 10,
    tradesPipData,
    monthlyPipData,
    pipCurve,
    pipDistribution: pipBuckets,
  }
}

/** Detect campaigns: groups of trades on the same symbol within a 4-hour window, simulating pyramiding. */
function detectCampaigns(trades: Trade[]): Campaign[] {
  const WINDOW_MS = 4 * 60 * 60 * 1000 // 4 hours
  const sorted = [...trades].sort((a, b) => a.openTime.getTime() - b.openTime.getTime())
  const campaigns: Campaign[] = []
  const used = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue
    const anchor = sorted[i]
    const group: Trade[] = [anchor]
    used.add(i)

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue
      const candidate = sorted[j]
      if (candidate.symbol !== anchor.symbol) continue
      if (candidate.type !== anchor.type) continue

      const lastInGroup = group[group.length - 1]
      const gap = candidate.openTime.getTime() - lastInGroup.openTime.getTime()
      if (gap <= WINDOW_MS) {
        group.push(candidate)
        used.add(j)
      }
    }

    if (group.length >= 1) {
      const pips = group.reduce((s, t) => s + tradePips(t), 0)
      const profit = group.reduce((s, t) => s + t.profit + t.commission + t.swap, 0)
      campaigns.push({
        trades: group,
        pips: Math.round(pips * 10) / 10,
        profit,
        ticketCount: group.length,
        symbol: anchor.symbol,
        startTime: group[0].openTime,
        endTime: group[group.length - 1].closeTime,
        isWin: profit > 0,
      })
    }
  }

  return campaigns.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
}

function buildPipDistribution(pipsArr: number[]): Array<{ range: string; count: number; isPositive: boolean }> {
  if (pipsArr.length === 0) return []
  const min = Math.min(...pipsArr)
  const max = Math.max(...pipsArr)
  if (min === max) return [{ range: `${min.toFixed(0)}`, count: pipsArr.length, isPositive: min >= 0 }]

  const bucketCount = 20
  const step = (max - min) / bucketCount
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    from: min + i * step,
    to: min + (i + 1) * step,
    count: 0,
  }))
  for (const v of pipsArr) {
    let idx = Math.floor((v - min) / step)
    if (idx >= bucketCount) idx = bucketCount - 1
    buckets[idx].count++
  }
  return buckets.map(b => ({
    range: `${b.from.toFixed(0)}…${b.to.toFixed(0)}`,
    count: b.count,
    isPositive: (b.from + b.to) / 2 >= 0,
  }))
}

/* ═══════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function MetricCard({ label, value, hint, tone, icon: Icon, bar }: {
  label: string
  value: string
  hint?: string
  tone?: "profit" | "loss" | "accent" | "blue"
  icon?: React.ElementType
  bar?: number
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md hover:shadow-primary/5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {Icon && <Icon className={cn(
              "h-3.5 w-3.5",
              tone === "profit" && "text-primary",
              tone === "loss" && "text-destructive",
              tone === "accent" && "text-accent",
              tone === "blue" && "text-[oklch(0.68_0.1_230)]",
              !tone && "text-muted-foreground"
            )} />}
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          </div>
          <div
            className={cn(
              "mt-1 font-mono text-2xl tnum truncate",
              tone === "profit" && "text-primary",
              tone === "loss" && "text-destructive",
              tone === "accent" && "text-accent",
              tone === "blue" && "text-[oklch(0.68_0.1_230)]",
            )}
            title={value}
          >
            {value}
          </div>
          {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
      </div>
      {bar !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full transition-all",
              tone === "loss" ? "bg-destructive" : tone === "accent" ? "bg-accent" : "bg-primary",
            )}
            style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%` }}
          />
        </div>
      )}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
        <Icon className="h-4.5 w-4.5 text-primary" />
      </div>
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div className="h-72 w-full p-2">
        {children}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   GOYA EXPLANATION ACCORDION
   ═══════════════════════════════════════════════════════════ */

function GoyaPhilosophyAccordion() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <Info className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">What is the GOYA Methodology?</div>
            <div className="text-xs text-muted-foreground">Get Off Your Ass — tap to learn the system</div>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <div className={cn(
        "overflow-hidden transition-all duration-300",
        open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="space-y-4 border-t border-border px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">1. Pip Extraction:</span> Focus on capturing raw market distance (pips), not dollars. The money is just a volume multiplier.
          </div>
          <div>
            <span className="font-semibold text-foreground">2. Extreme Asymmetry:</span> Risk 50 pips to catch 500+. A 15–20% win rate is perfectly fine — one big winner pays for 8 small losses.
          </div>
          <div>
            <span className="font-semibold text-foreground">3. Business Expenses:</span> Every loss is a fixed operational cost. Stop-losses are never moved, lot sizes never varied by &quot;conviction.&quot;
          </div>
          <div>
            <span className="font-semibold text-foreground">4. Aggregate Pips:</span> Multiple tranches on the same move multiply pip count. 4 tickets × 250 pips = 1,000 aggregate pips.
          </div>
          <div>
            <span className="font-semibold text-foreground">5. Pyramiding:</span> Probe → Scale-In → Risk Segregation. Build campaigns in stages, locking in risk-free profits as you go.
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN GOYA TAB
   ═══════════════════════════════════════════════════════════ */

export function GoyaTab() {
  const { statement, breakevenTickets } = useStatement()
  if (!statement) return null
  const currency = statement.account.currency
  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])
  const kpi = useMemo(() => computeKPI(statement, breakevenSet), [statement, breakevenSet])
  const goya = useMemo(() => computeGoyaMetrics(statement, kpi, breakevenSet), [statement, kpi, breakevenSet])

  const [campaignView, setCampaignView] = useState<"top" | "all">("top")
  const displayCampaigns = campaignView === "top"
    ? [...goya.campaigns].sort((a, b) => b.pips - a.pips).slice(0, 10)
    : goya.campaigns

  const multiTicketCampaigns = goya.campaigns.filter(c => c.ticketCount > 1)

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-accent/5 blur-3xl" />

        <div className="relative z-10 px-6 py-8 md:px-10 md:py-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">GOYA Analytics</h1>
              <p className="text-xs text-muted-foreground">Pip Extraction · Business P&L · Campaign Analysis</p>
            </div>
          </div>

          {/* Big 4 hero stats */}
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Net Pips Extracted</div>
              <div className={cn("mt-1 font-mono text-2xl tnum", goya.netPips >= 0 ? "text-primary" : "text-destructive")}>
                {goya.netPips >= 0 ? "+" : ""}{goya.netPips.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Aggregate Pips</div>
              <div className="mt-1 font-mono text-2xl tnum text-accent">
                {goya.aggregatePips.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Net Business Income</div>
              <div className={cn("mt-1 font-mono text-2xl tnum", goya.netBusinessIncome >= 0 ? "text-primary" : "text-destructive")}>
                {formatCurrency(goya.netBusinessIncome, currency)}
              </div>
            </div>
            <div className="rounded-lg border border-[oklch(0.68_0.1_230)]/20 bg-[oklch(0.68_0.1_230)]/5 px-4 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">R:R Realized</div>
              <div className="mt-1 font-mono text-2xl tnum text-[oklch(0.68_0.1_230)]">
                1:{goya.riskRewardRealized.toFixed(1)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Philosophy accordion */}
      <GoyaPhilosophyAccordion />

      {/* ═══════════════════════ SECTION 1: PIP EXTRACTION ═══════════════════════ */}
      <div>
        <SectionHeader icon={Crosshair} title="Pip Extraction Dashboard" subtitle="Raw pip performance across all trades" />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <MetricCard icon={TrendingUp} label="Pips Extracted (Wins)" value={`+${goya.totalPipsExtracted.toLocaleString()}`} tone="profit" hint={`${kpi.wins} winning trades`} />
          <MetricCard icon={TrendingDown} label="Pips Lost (Losses)" value={`-${goya.totalPipsLost.toLocaleString()}`} tone="loss" hint={`${kpi.losses} losing trades`} />
          <MetricCard icon={Target} label="Net Pips" value={`${goya.netPips >= 0 ? "+" : ""}${goya.netPips.toLocaleString()}`} tone={goya.netPips >= 0 ? "profit" : "loss"} hint="Extracted − Lost" />
          <MetricCard icon={Layers} label="Aggregate Pips" value={goya.aggregatePips.toLocaleString()} tone="accent" hint="Sum of |pips| per ticket" />
          <MetricCard icon={ArrowUpRight} label="Avg Pips / Win" value={`+${goya.avgPipsPerWin.toLocaleString()}`} tone="profit" />
          <MetricCard icon={ArrowDownRight} label="Avg Pips / Loss" value={`-${goya.avgPipsPerLoss.toLocaleString()}`} tone="loss" />
          <MetricCard icon={Trophy} label="Largest Pip Win" value={`+${goya.largestPipWin.toLocaleString()}`} tone="profit" />
          <MetricCard icon={ShieldAlert} label="Largest Pip Loss" value={`-${goya.largestPipLoss.toLocaleString()}`} tone="loss" />
          <MetricCard icon={BarChart3} label="Median Pips / Trade" value={goya.medianPipsPerTrade.toLocaleString()} hint="Middle of distribution" />
          <MetricCard icon={Activity} label="Avg Pips / Trade" value={goya.avgPipsPerTrade.toLocaleString()} hint="Including wins & losses" />
          <MetricCard icon={Gauge} label="Max DD (Pips)" value={`-${goya.maxDrawdownPips.toLocaleString()}`} tone="loss" hint="Peak-to-trough in pips" />
          <MetricCard icon={Flame} label="Recovery Trades" value={goya.recoveryTradesAfterMaxDD.toLocaleString()} hint="Trades to recover from max DD" />
        </div>
      </div>

      {/* Cumulative Pip Curve */}
      <ChartCard title="Cumulative Pip Extraction Curve" subtitle="Running total of net pips over trade history">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={goya.pipCurve} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="pipGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="index" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60}
              tickFormatter={(v) => `${Number(v).toLocaleString()}`} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" strokeOpacity={0.5} />
            <Tooltip
              content={({ active, payload }: any) =>
                active && payload?.[0] ? (
                  <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                    <div className="font-mono text-muted-foreground">Trade #{payload[0].payload.index + 1}</div>
                    <div className={cn("font-mono tnum", payload[0].value >= 0 ? "text-primary" : "text-destructive")}>
                      {payload[0].value >= 0 ? "+" : ""}{Number(payload[0].value).toLocaleString()} pips
                    </div>
                  </div>
                ) : null
              }
            />
            <Area dataKey="cumPips" type="monotone" stroke="var(--primary)" strokeWidth={2} fill="url(#pipGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Pip Distribution */}
      <ChartCard title="Pip Distribution per Trade" subtitle="Histogram of pips captured on each trade">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={goya.pipDistribution} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="range" stroke="var(--muted-foreground)" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={1} />
            <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              content={({ active, payload }: any) =>
                active && payload?.[0] ? (
                  <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                    <div className="font-mono text-muted-foreground">{payload[0].payload.range} pips</div>
                    <div className="font-mono tnum text-foreground">{payload[0].value} trades</div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {goya.pipDistribution.map((d, i) => (
                <Cell key={i} fill={d.isPositive ? "var(--primary)" : "var(--destructive)"} fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ═══════════════════════ SECTION 2: BUSINESS P&L ═══════════════════════ */}
      <div>
        <SectionHeader icon={Building2} title="Business P&L Statement" subtitle="Treating your trading as a business entity" />

        {/* P&L Summary Card */}
        <div className="mb-4 rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-border">
                <td className="px-5 py-3 text-muted-foreground flex items-center gap-2">
                  <Banknote className="h-3.5 w-3.5 text-primary" /> Gross Revenue (Winning Trades)
                </td>
                <td className="px-5 py-3 text-right font-mono tnum text-primary">
                  +{formatCurrency(goya.grossRevenue, currency)}
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-5 py-3 text-muted-foreground flex items-center gap-2">
                  <Receipt className="h-3.5 w-3.5 text-destructive" /> Business Expenses (Losing Trades)
                </td>
                <td className="px-5 py-3 text-right font-mono tnum text-destructive">
                  −{formatCurrency(goya.businessExpenses, currency)}
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-5 py-3 text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" /> Operating Costs (Commission + Swap)
                </td>
                <td className="px-5 py-3 text-right font-mono tnum text-muted-foreground">
                  −{formatCurrency(goya.operatingCosts, currency)}
                </td>
              </tr>
              <tr className="bg-secondary/30">
                <td className="px-5 py-3.5 font-semibold flex items-center gap-2">
                  <PiggyBank className={cn("h-4 w-4", goya.netBusinessIncome >= 0 ? "text-primary" : "text-destructive")} />
                  Net Business Income
                </td>
                <td className={cn("px-5 py-3.5 text-right font-mono text-lg tnum font-semibold", goya.netBusinessIncome >= 0 ? "text-primary" : "text-destructive")}>
                  {goya.netBusinessIncome >= 0 ? "+" : ""}{formatCurrency(goya.netBusinessIncome, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <MetricCard icon={Receipt} label="Cost Per Probe" value={formatCurrency(goya.costPerProbe, currency)} tone="loss" hint="Avg expense per losing trade" />
          <MetricCard icon={Banknote} label="Revenue Per Win" value={formatCurrency(goya.revenuePerCampaign, currency)} tone="profit" hint="Avg income per winning trade" />
          <MetricCard icon={Percent} label="Expense Ratio" value={formatPct(goya.expenseRatio, 1)} tone={goya.expenseRatio < 0.5 ? "profit" : "loss"} hint="Expenses / Revenue" bar={goya.expenseRatio} />
          <MetricCard icon={Percent} label="Profit Margin" value={formatPct(goya.profitMargin, 1)} tone={goya.profitMargin > 0 ? "profit" : "loss"} hint="Net Income / Revenue" bar={Math.max(0, goya.profitMargin)} />
          <MetricCard icon={Scale} label="ROI on Expenses" value={`${(goya.roiOnExpenses * 100).toFixed(1)}%`} tone={goya.roiOnExpenses > 0 ? "profit" : "loss"} hint="Net income / total costs" />
          <MetricCard icon={DollarSign} label="Edge Multiplier" value={`${goya.edgeMultiplier}×`} tone={goya.edgeMultiplier > 1 ? "profit" : "loss"} hint="Revenue / Expenses" />
          <MetricCard icon={Receipt} label="Operating Costs" value={formatCurrency(goya.operatingCosts, currency)} hint="Commission + Swap total" />
          <MetricCard icon={Activity} label="Max Loss Streak Cost" value={formatCurrency(goya.longestLossStreakCost, currency)} tone="loss" hint={`${goya.maxConsecLosses} consecutive losses`} />
        </div>
      </div>

      {/* Monthly P&L as a business */}
      <ChartCard title="Monthly Business P&L" subtitle="Revenue (green) vs Expenses (red) per month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={goya.monthlyPipData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60}
              tickFormatter={(v) => `${Number(v) >= 0 ? "+" : ""}${(Number(v) / 1000).toFixed(0)}K`} />
            <Tooltip
              content={({ active, payload }: any) =>
                active && payload?.[0] ? (
                  <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                    <div className="font-mono text-muted-foreground mb-1">{payload[0].payload.label}</div>
                    <div className="font-mono tnum text-primary">Revenue: +{formatCurrency(payload[0].payload.revenue, "USD")}</div>
                    <div className="font-mono tnum text-destructive">Expenses: −{formatCurrency(payload[0].payload.expenses, "USD")}</div>
                    <div className={cn("font-mono tnum font-semibold mt-1", payload[0].payload.netIncome >= 0 ? "text-primary" : "text-destructive")}>
                      Net: {payload[0].payload.netIncome >= 0 ? "+" : ""}{formatCurrency(payload[0].payload.netIncome, "USD")}
                    </div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="revenue" fill="var(--primary)" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" fill="var(--destructive)" fillOpacity={0.6} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Monthly Net Pips chart */}
      <ChartCard title="Monthly Net Pip Extraction" subtitle="Pips won vs pips lost each month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={goya.monthlyPipData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" strokeOpacity={0.5} />
            <Tooltip
              content={({ active, payload }: any) =>
                active && payload?.[0] ? (
                  <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs backdrop-blur">
                    <div className="font-mono text-muted-foreground mb-1">{payload[0].payload.label}</div>
                    <div className="font-mono tnum text-primary">Won: +{payload[0].payload.pipsWon} pips</div>
                    <div className="font-mono tnum text-destructive">Lost: −{payload[0].payload.pipsLost} pips</div>
                    <div className={cn("font-mono tnum font-semibold mt-1", payload[0].payload.netPips >= 0 ? "text-primary" : "text-destructive")}>
                      Net: {payload[0].payload.netPips >= 0 ? "+" : ""}{payload[0].payload.netPips} pips
                    </div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="netPips" radius={[3, 3, 0, 0]}>
              {goya.monthlyPipData.map((m, i) => (
                <Cell key={i} fill={m.netPips >= 0 ? "var(--primary)" : "var(--destructive)"} fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ═══════════════════════ SECTION 3: ASYMMETRY ═══════════════════════ */}
      <div>
        <SectionHeader icon={Scale} title="Asymmetry Analysis" subtitle="Risk/reward structure and the GOYA edge" />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <MetricCard icon={Target} label="R:R Realized" value={`1:${goya.riskRewardRealized}`} tone={goya.riskRewardRealized >= 2 ? "profit" : goya.riskRewardRealized >= 1 ? "accent" : "loss"} hint="Avg win pips / avg loss pips" bar={Math.min(1, goya.riskRewardRealized / 5)} />
          <MetricCard icon={Target} label="R:R Planned (SL→TP)" value={goya.riskRewardPlanned > 0 ? `1:${goya.riskRewardPlanned}` : "—"} tone={goya.riskRewardPlanned >= 2 ? "profit" : "accent"} hint="Avg TP distance / avg SL distance" bar={goya.riskRewardPlanned > 0 ? Math.min(1, goya.riskRewardPlanned / 5) : 0} />
          <MetricCard icon={Zap} label="Asymmetry Score" value={goya.asymmetryScore.toLocaleString()} tone={goya.asymmetryScore >= 2 ? "profit" : goya.asymmetryScore >= 1 ? "accent" : "loss"} hint="Realized R:R × Payoff Ratio" />
          <MetricCard icon={Percent} label="Win Rate" value={formatPct(kpi.winRate, 1)} tone={kpi.winRate >= 0.4 ? "profit" : undefined} hint={`${kpi.wins}W · ${kpi.losses}L`} bar={kpi.winRate} />
          <MetricCard icon={Scale} label="Payoff Ratio" value={kpi.payoffRatio.toFixed(2)} tone={kpi.payoffRatio >= 1.5 ? "profit" : kpi.payoffRatio >= 1 ? "accent" : "loss"} hint="Avg Win / |Avg Loss|" bar={Math.min(1, kpi.payoffRatio / 4)} />
          <MetricCard icon={Calculator} label="Kelly Criterion" value={formatPct(kpi.kellyPct, 1)} tone={kpi.kellyPct > 0 ? "profit" : "loss"} hint="Optimal risk per trade" bar={Math.max(0, kpi.kellyPct)} />
          <MetricCard icon={Activity} label="Profit Factor" value={Number.isFinite(kpi.profitFactor) ? kpi.profitFactor.toFixed(2) : "∞"} tone={kpi.profitFactor >= 1.5 ? "profit" : kpi.profitFactor >= 1 ? "accent" : "loss"} hint="Gross profit / gross loss" bar={Math.min(1, kpi.profitFactor / 3)} />
          <MetricCard icon={Activity} label="Expectancy / Trade" value={`${kpi.expectancy >= 0 ? "+" : ""}${formatCurrency(kpi.expectancy, currency)}`} tone={kpi.expectancy >= 0 ? "profit" : "loss"} hint="Expected value per trade" />
        </div>
      </div>

      {/* ═══════════════════════ SECTION 4: PIP VELOCITY ═══════════════════════ */}
      <div>
        <SectionHeader icon={Gauge} title="Pip Velocity & Efficiency" subtitle="Extraction rate and trading tempo" />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <MetricCard icon={Clock} label="Trading Span" value={`${goya.tradingDays} days`} hint="Calendar days covered" />
          <MetricCard icon={Crosshair} label="Pips / Day" value={`${goya.pipsPerDay >= 0 ? "+" : ""}${goya.pipsPerDay}`} tone={goya.pipsPerDay >= 0 ? "profit" : "loss"} />
          <MetricCard icon={Crosshair} label="Pips / Week" value={`${goya.pipsPerWeek >= 0 ? "+" : ""}${goya.pipsPerWeek}`} tone={goya.pipsPerWeek >= 0 ? "profit" : "loss"} hint="5 trading days" />
          <MetricCard icon={Crosshair} label="Pips / Month" value={`${goya.pipsPerMonth >= 0 ? "+" : ""}${goya.pipsPerMonth}`} tone={goya.pipsPerMonth >= 0 ? "profit" : "loss"} hint="22 trading days" />
          <MetricCard icon={Activity} label="Trades / Day" value={goya.tradesPerDay.toLocaleString()} hint="Average trade frequency" />
          <MetricCard icon={Flame} label="Max Win Streak" value={goya.maxConsecWins.toLocaleString()} tone="profit" />
          <MetricCard icon={ShieldAlert} label="Max Loss Streak" value={goya.maxConsecLosses.toLocaleString()} tone="loss" />
          <MetricCard icon={Trophy} label="Sharpe Ratio" value={kpi.sharpe.toFixed(3)} tone={kpi.sharpe >= 1 ? "profit" : kpi.sharpe >= 0 ? undefined : "loss"} hint="Risk-adjusted return" bar={Math.min(1, Math.max(0, kpi.sharpe / 3))} />
        </div>
      </div>

      {/* ═══════════════════════ SECTION 5: CAMPAIGNS ═══════════════════════ */}
      <div>
        <SectionHeader icon={Layers} title="Campaign Analysis" subtitle={`${goya.totalCampaigns} campaigns detected (trades grouped by symbol within 4h windows)`} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
          <MetricCard icon={Layers} label="Total Campaigns" value={goya.totalCampaigns.toLocaleString()} />
          <MetricCard icon={TrendingUp} label="Winning Campaigns" value={goya.winningCampaigns.toLocaleString()} tone="profit" hint={formatPct(goya.campaignWinRate, 1)} />
          <MetricCard icon={TrendingDown} label="Losing Campaigns" value={goya.losingCampaigns.toLocaleString()} tone="loss" />
          <MetricCard icon={BarChart3} label="Avg Tickets / Campaign" value={goya.avgTicketsPerCampaign.toLocaleString()} hint="Multi-tranche scaling" />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
          <MetricCard icon={Trophy} label="Best Campaign" value={`+${goya.bestCampaignPips} pips`} tone="profit" />
          <MetricCard icon={ShieldAlert} label="Worst Campaign" value={`${goya.worstCampaignPips} pips`} tone="loss" />
          <MetricCard icon={BarChart3} label="Avg Campaign Pips" value={`${goya.avgCampaignPips >= 0 ? "+" : ""}${goya.avgCampaignPips} pips`} tone={goya.avgCampaignPips >= 0 ? "profit" : "loss"} />
          <MetricCard icon={Layers} label="Multi-Ticket Campaigns" value={multiTicketCampaigns.length.toLocaleString()} tone="accent" hint="Pyramided entries" />
        </div>

        {/* Campaign table */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-medium">Campaign Ledger</div>
              <div className="text-xs text-muted-foreground">Each campaign = grouped trades on same symbol/direction</div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setCampaignView("top")}
                className={cn("rounded-md px-2.5 py-1 text-xs transition-colors", campaignView === "top" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50")}
              >
                Top 10
              </button>
              <button
                type="button"
                onClick={() => setCampaignView("all")}
                className={cn("rounded-md px-2.5 py-1 text-xs transition-colors", campaignView === "all" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50")}
              >
                All
              </button>
            </div>
          </div>
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Symbol</th>
                  <th className="px-3 py-2 text-left font-medium">Tickets</th>
                  <th className="px-3 py-2 text-right font-medium">Pips</th>
                  <th className="px-3 py-2 text-right font-medium">Profit</th>
                  <th className="px-3 py-2 text-left font-medium">Start</th>
                  <th className="px-3 py-2 text-center font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {displayCampaigns.map((c, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-3 py-2 font-mono">{c.symbol}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{c.ticketCount}</td>
                    <td className={cn("px-3 py-2 text-right font-mono tnum", c.pips >= 0 ? "text-primary" : "text-destructive")}>
                      {c.pips >= 0 ? "+" : ""}{c.pips}
                    </td>
                    <td className={cn("px-3 py-2 text-right font-mono tnum", c.profit >= 0 ? "text-primary" : "text-destructive")}>
                      {c.profit >= 0 ? "+" : ""}{formatCurrency(c.profit, currency)}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {c.startTime.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        c.isWin ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                      )}>
                        {c.isWin ? "WIN" : "LOSS"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ SECTION 6: GOYA SCORECARD ═══════════════════════ */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 shadow-[0_0_60px_-12px] shadow-primary/15">
        <div className="px-6 py-8 md:px-10">
          <div className="flex items-center gap-3 mb-5">
            <Trophy className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-bold">GOYA Scorecard</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ScoreRow label="Pip Extraction" value={goya.netPips >= 0 ? "POSITIVE" : "NEGATIVE"} pass={goya.netPips >= 0} detail={`${goya.netPips >= 0 ? "+" : ""}${goya.netPips.toLocaleString()} net pips`} />
            <ScoreRow label="Asymmetric R:R" value={goya.riskRewardRealized >= 2 ? "STRONG" : goya.riskRewardRealized >= 1 ? "FAIR" : "WEAK"} pass={goya.riskRewardRealized >= 1.5} detail={`1:${goya.riskRewardRealized} realized`} />
            <ScoreRow label="Expense Efficiency" value={goya.expenseRatio < 0.5 ? "EFFICIENT" : goya.expenseRatio < 0.8 ? "MODERATE" : "HIGH COST"} pass={goya.expenseRatio < 0.6} detail={`${(goya.expenseRatio * 100).toFixed(1)}% expense ratio`} />
            <ScoreRow label="Profit Margin" value={goya.profitMargin > 0.3 ? "STRONG" : goya.profitMargin > 0 ? "THIN" : "NEGATIVE"} pass={goya.profitMargin > 0.1} detail={`${(goya.profitMargin * 100).toFixed(1)}% margin`} />
            <ScoreRow label="Loss Tolerance" value={goya.maxConsecLosses <= 10 ? "MANAGEABLE" : "HIGH"} pass={goya.maxConsecLosses <= 10} detail={`${goya.maxConsecLosses} max consecutive losses`} />
            <ScoreRow label="Pip Velocity" value={goya.pipsPerDay >= 0 ? "EXTRACTING" : "BLEEDING"} pass={goya.pipsPerDay >= 0} detail={`${goya.pipsPerDay >= 0 ? "+" : ""}${goya.pipsPerDay} pips/day`} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ScoreRow({ label, value, pass, detail }: { label: string; value: string; pass: boolean; detail: string }) {
  return (
    <div className={cn(
      "flex items-center justify-between rounded-lg border px-4 py-3",
      pass ? "border-primary/20 bg-primary/5" : "border-destructive/20 bg-destructive/5"
    )}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <span className={cn(
        "rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider",
        pass ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
      )}>
        {value}
      </span>
    </div>
  )
}
