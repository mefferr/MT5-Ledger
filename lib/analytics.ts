import type { ParsedStatement, Trade } from "./types"

export interface KPI {
  totalTrades: number
  wins: number
  losses: number
  breakeven: number
  winRate: number
  grossProfit: number
  grossLoss: number
  netProfit: number
  profitFactor: number
  expectancy: number
  avgWin: number
  avgLoss: number
  largestWin: number
  largestLoss: number
  totalCommission: number
  totalSwap: number
  avgTradeDurationMin: number
  totalVolume: number
  roi: number
  initialDeposit: number
  finalBalance: number
  peakBalance: number
  maxDrawdown: number
  maxDrawdownPct: number
  sharpe: number
  sortino: number
  recoveryFactor: number
  payoffRatio: number
  kellyPct: number
  avgRMultiple: number
  consecWins: number
  consecLosses: number
}

export interface EquityPoint {
  index: number
  time: number
  balance: number
  drawdown: number
  drawdownPct: number
  peak: number
  profit: number
  ticket: number
}

export interface DailyStat {
  date: string // yyyy-mm-dd
  profit: number
  trades: number
  wins: number
  losses: number
  volume: number
}

export interface MonthlyStat {
  key: string // yyyy-mm
  label: string
  profit: number
  trades: number
  wins: number
  losses: number
  winRate: number
}

export interface SymbolStat {
  symbol: string
  trades: number
  wins: number
  losses: number
  winRate: number
  profit: number
  volume: number
  avgSize: number
  largestWin: number
  largestLoss: number
  profitFactor: number
}

export interface SessionStat {
  name: string
  range: string
  trades: number
  wins: number
  losses: number
  profit: number
  winRate: number
}

/* ─── Helpers: classify a trade as win/loss/breakeven ─── */

function isWin(t: Trade, be: Set<number>): boolean {
  return t.profit > 0 && !be.has(t.ticket)
}

function isLoss(t: Trade, be: Set<number>): boolean {
  return t.profit < 0 && !be.has(t.ticket)
}

export function computeKPI(statement: ParsedStatement, breakevenTickets: Set<number> = new Set()): KPI {
  const trades = statement.trades
  const wins = trades.filter((t) => isWin(t, breakevenTickets))
  const losses = trades.filter((t) => isLoss(t, breakevenTickets))
  const breakeven = trades.filter((t) => t.profit === 0 || breakevenTickets.has(t.ticket))

  const grossProfit = wins.reduce((s, t) => s + t.profit, 0)
  const grossLoss = losses.reduce((s, t) => s + t.profit, 0) // negative

  const totalCommission = trades.reduce((s, t) => s + t.commission, 0)
  const totalSwap = trades.reduce((s, t) => s + t.swap, 0)
  const netProfit = trades.reduce((s, t) => s + t.profit + t.commission + t.swap, 0)

  const totalVolume = trades.reduce((s, t) => s + t.size, 0)
  const avgWin = wins.length ? grossProfit / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0
  const largestWin = wins.reduce((m, t) => Math.max(m, t.profit), 0)
  const largestLoss = losses.reduce((m, t) => Math.min(m, t.profit), 0)

  const nonBE = wins.length + losses.length
  const winRate = nonBE ? wins.length / nonBE : 0
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : grossProfit / Math.abs(grossLoss)
  const expectancy = nonBE ? (grossProfit + grossLoss) / nonBE : 0
  const payoffRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0

  const durations = trades
    .map((t) => t.closeTime.getTime() - t.openTime.getTime())
    .filter((d) => Number.isFinite(d) && d > 0)
  const avgTradeDurationMin =
    durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length / 60000 : 0

  const startingCapital = getStartingCapital(statement)
  const equity = buildEquityCurve(statement)
  
  // Real final balance of the trading strategy (ignoring future deposits/withdrawals)
  const finalBalance = startingCapital + netProfit
  const peakBalance = equity.reduce((m, p) => Math.max(m, p.balance), startingCapital)
  const maxDrawdown = equity.reduce((m, p) => Math.max(m, p.drawdown), 0)
  const maxDrawdownPct = equity.reduce((m, p) => Math.max(m, p.drawdownPct), 0)
  
  // ROI based on the capital at the moment trading started
  const roi = startingCapital > 0 ? netProfit / startingCapital : 0

  // Sharpe / Sortino based on per-trade P/L series (not annualized)
  const returns = trades.map((t) => t.profit + t.commission + t.swap)
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const variance = returns.length
    ? returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length
    : 0
  const stdev = Math.sqrt(variance)
  const downside = returns.filter((r) => r < 0)
  const downsideVar = downside.length
    ? downside.reduce((s, r) => s + r ** 2, 0) / downside.length
    : 0
  const downsideDev = Math.sqrt(downsideVar)
  const sharpe = stdev > 0 ? (mean / stdev) * Math.sqrt(trades.length) : 0
  const sortino = downsideDev > 0 ? (mean / downsideDev) * Math.sqrt(trades.length) : 0

  const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : 0
  const kellyPct = avgLoss !== 0 && avgWin !== 0 ? winRate - (1 - winRate) / (avgWin / Math.abs(avgLoss)) : 0

  // R-multiple: (profit / risk) where risk = |open - sl| * size * pip-approx
  // We use dollar risk ≈ size * |open - sl| * 100 for XAUUSD-like, generalize: profit / (size * |open-sl|) as proxy
  const rMultiples: number[] = []
  for (const t of trades) {
    if (breakevenTickets.has(t.ticket)) continue
    const riskPerUnit = Math.abs(t.openPrice - t.sl)
    if (riskPerUnit > 0 && t.size > 0) {
      // crude but consistent R proxy across trades
      const riskDollar = riskPerUnit * t.size * 100
      if (riskDollar > 0) rMultiples.push(t.profit / riskDollar)
    }
  }
  const avgRMultiple = rMultiples.length ? rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length : 0

  const { maxWinStreak, maxLossStreak } = computeStreaks(trades, breakevenTickets)

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate,
    grossProfit,
    grossLoss,
    netProfit,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    largestWin,
    largestLoss,
    totalCommission,
    totalSwap,
    avgTradeDurationMin,
    totalVolume,
    roi,
    initialDeposit: statement.initialDeposit,
    finalBalance,
    peakBalance,
    maxDrawdown,
    maxDrawdownPct,
    sharpe,
    sortino,
    recoveryFactor,
    payoffRatio,
    kellyPct,
    avgRMultiple,
    consecWins: maxWinStreak,
    consecLosses: maxLossStreak,
  }
}

export function getStartingCapital(statement: ParsedStatement): number {
  if (statement.trades.length === 0) return statement.initialDeposit || 0
  const firstTradeTime = Math.min(...statement.trades.map(t => t.openTime.getTime()))
  let capital = 0
  for (const b of statement.balanceEntries) {
    if (b.time.getTime() <= firstTradeTime) {
      capital += b.amount
    }
  }
  return capital !== 0 ? capital : (statement.initialDeposit || 0)
}

export function buildEquityCurve(statement: ParsedStatement): EquityPoint[] {
  const startingCapital = getStartingCapital(statement)
  const events: Array<{ time: Date; amount: number; ticket: number }> = []
  
  // Only add actual trades to the curve, ignore subsequent deposits/withdrawals
  for (const t of statement.trades) {
    events.push({
      time: t.closeTime,
      amount: t.profit + t.commission + t.swap,
      ticket: t.ticket,
    })
  }
  events.sort((a, b) => a.time.getTime() - b.time.getTime())

  let balance = startingCapital
  let peak = startingCapital
  const out: EquityPoint[] = []
  
  if (events.length > 0) {
    const firstTradeTime = Math.min(...statement.trades.map(t => t.openTime.getTime()))
    out.push({
      index: 0,
      time: firstTradeTime > 0 ? firstTradeTime : events[0].time.getTime(),
      balance: startingCapital,
      peak: startingCapital,
      drawdown: 0,
      drawdownPct: 0,
      profit: 0,
      ticket: 0
    })
  }

  events.forEach((e, i) => {
    balance += e.amount
    if (balance > peak) peak = balance
    const dd = peak - balance
    out.push({
      index: i + 1,
      time: e.time.getTime(),
      balance,
      peak,
      drawdown: dd,
      drawdownPct: peak > 0 ? (dd / peak) * 100 : 0,
      profit: e.amount,
      ticket: e.ticket,
    })
  })
  return out
}

export function computeStreaks(trades: Trade[], breakevenTickets: Set<number> = new Set()) {
  let maxWinStreak = 0
  let maxLossStreak = 0
  let curWin = 0
  let curLoss = 0
  for (const t of trades) {
    if (breakevenTickets.has(t.ticket)) {
      // BE-marked trades don't break or extend streaks
      continue
    }
    if (t.profit > 0) {
      curWin++
      curLoss = 0
      if (curWin > maxWinStreak) maxWinStreak = curWin
    } else if (t.profit < 0) {
      curLoss++
      curWin = 0
      if (curLoss > maxLossStreak) maxLossStreak = curLoss
    } else {
      curWin = 0
      curLoss = 0
    }
  }
  return { maxWinStreak, maxLossStreak }
}

export function dailyStats(trades: Trade[], breakevenTickets: Set<number> = new Set()): DailyStat[] {
  const map = new Map<string, DailyStat>()
  for (const t of trades) {
    const d = t.closeTime
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const cur =
      map.get(key) ??
      { date: key, profit: 0, trades: 0, wins: 0, losses: 0, volume: 0 }
    cur.profit += t.profit + t.commission + t.swap
    cur.trades += 1
    cur.volume += t.size
    if (isWin(t, breakevenTickets)) cur.wins += 1
    else if (isLoss(t, breakevenTickets)) cur.losses += 1
    map.set(key, cur)
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function monthlyStats(trades: Trade[], breakevenTickets: Set<number> = new Set()): MonthlyStat[] {
  const map = new Map<string, MonthlyStat>()
  for (const t of trades) {
    const d = t.closeTime
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    const cur = map.get(key) ?? { key, label, profit: 0, trades: 0, wins: 0, losses: 0, winRate: 0 }
    cur.profit += t.profit + t.commission + t.swap
    cur.trades += 1
    if (isWin(t, breakevenTickets)) cur.wins += 1
    else if (isLoss(t, breakevenTickets)) cur.losses += 1
    map.set(key, cur)
  }
  const list = Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1))
  for (const m of list) {
    const nonBE = m.wins + m.losses
    m.winRate = nonBE ? m.wins / nonBE : 0
  }
  return list
}

export function symbolStats(trades: Trade[], breakevenTickets: Set<number> = new Set()): SymbolStat[] {
  const map = new Map<string, SymbolStat>()
  for (const t of trades) {
    const cur =
      map.get(t.symbol) ??
      {
        symbol: t.symbol,
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        profit: 0,
        volume: 0,
        avgSize: 0,
        largestWin: 0,
        largestLoss: 0,
        profitFactor: 0,
      }
    cur.trades += 1
    cur.profit += t.profit + t.commission + t.swap
    cur.volume += t.size
    if (isWin(t, breakevenTickets)) {
      cur.wins += 1
      if (t.profit > cur.largestWin) cur.largestWin = t.profit
    } else if (isLoss(t, breakevenTickets)) {
      cur.losses += 1
      if (t.profit < cur.largestLoss) cur.largestLoss = t.profit
    }
    map.set(t.symbol, cur)
  }
  const list = Array.from(map.values())
  for (const s of list) {
    s.avgSize = s.trades ? s.volume / s.trades : 0
    const nonBE = s.wins + s.losses
    s.winRate = nonBE ? s.wins / nonBE : 0
    const sTrades = trades.filter((t) => t.symbol === s.symbol)
    const gp = sTrades.filter((t) => isWin(t, breakevenTickets)).reduce((a, t) => a + t.profit, 0)
    const gl = Math.abs(sTrades.filter((t) => isLoss(t, breakevenTickets)).reduce((a, t) => a + t.profit, 0))
    s.profitFactor = gl === 0 ? (gp > 0 ? Number.POSITIVE_INFINITY : 0) : gp / gl
  }
  return list.sort((a, b) => b.profit - a.profit)
}

// Trading sessions (server-time approximation, UTC hours)
const SESSIONS: Array<{ name: string; start: number; end: number; range: string }> = [
  { name: "Sydney", start: 21, end: 6, range: "21:00 \u2013 06:00 UTC" },
  { name: "Tokyo", start: 0, end: 9, range: "00:00 \u2013 09:00 UTC" },
  { name: "London", start: 7, end: 16, range: "07:00 \u2013 16:00 UTC" },
  { name: "New York", start: 12, end: 21, range: "12:00 \u2013 21:00 UTC" },
]

function inSession(hour: number, s: { start: number; end: number }) {
  if (s.start < s.end) return hour >= s.start && hour < s.end
  return hour >= s.start || hour < s.end
}

export function sessionStats(trades: Trade[], breakevenTickets: Set<number> = new Set()): SessionStat[] {
  return SESSIONS.map((s) => {
    const inside = trades.filter((t) => {
      const h = t.openTime.getUTCHours()
      return inSession(h, s)
    })
    const wins = inside.filter((t) => isWin(t, breakevenTickets)).length
    const losses = inside.filter((t) => isLoss(t, breakevenTickets)).length
    const profit = inside.reduce((a, t) => a + t.profit + t.commission + t.swap, 0)
    const nonBE = wins + losses
    return {
      name: s.name,
      range: s.range,
      trades: inside.length,
      wins,
      losses,
      profit,
      winRate: nonBE ? wins / nonBE : 0,
    }
  })
}

export function hourlyStats(trades: Trade[], breakevenTickets: Set<number> = new Set()) {
  const out = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, "0")}:00`,
    trades: 0,
    profit: 0,
    wins: 0,
    losses: 0,
  }))
  for (const t of trades) {
    const h = t.openTime.getHours()
    if (!Number.isFinite(h)) continue
    out[h].trades += 1
    out[h].profit += t.profit + t.commission + t.swap
    if (isWin(t, breakevenTickets)) out[h].wins += 1
    else if (isLoss(t, breakevenTickets)) out[h].losses += 1
  }
  return out
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function dayOfWeekStats(trades: Trade[], breakevenTickets: Set<number> = new Set()) {
  const out = DAY_NAMES.map((d, i) => ({
    day: d,
    index: i,
    trades: 0,
    profit: 0,
    wins: 0,
    losses: 0,
  }))
  for (const t of trades) {
    const d = t.openTime.getDay()
    if (!Number.isFinite(d)) continue
    out[d].trades += 1
    out[d].profit += t.profit + t.commission + t.swap
    if (isWin(t, breakevenTickets)) out[d].wins += 1
    else if (isLoss(t, breakevenTickets)) out[d].losses += 1
  }
  return out
}

export function typeStats(trades: Trade[], breakevenTickets: Set<number> = new Set()) {
  const build = (type: "buy" | "sell") => {
    const sub = trades.filter((t) => t.type === type)
    const wins = sub.filter((t) => isWin(t, breakevenTickets)).length
    const losses = sub.filter((t) => isLoss(t, breakevenTickets)).length
    const nonBE = wins + losses
    return {
      type,
      trades: sub.length,
      wins,
      losses,
      winRate: nonBE ? wins / nonBE : 0,
      profit: sub.reduce((a, t) => a + t.profit + t.commission + t.swap, 0),
    }
  }
  return [build("buy"), build("sell")]
}

export function durationBuckets(trades: Trade[], breakevenTickets: Set<number> = new Set()) {
  const buckets = [
    { label: "< 15m", min: 0, max: 15 },
    { label: "15m\u20131h", min: 15, max: 60 },
    { label: "1\u20134h", min: 60, max: 240 },
    { label: "4h\u20131d", min: 240, max: 1440 },
    { label: "1\u20133d", min: 1440, max: 4320 },
    { label: "3d+", min: 4320, max: Number.POSITIVE_INFINITY },
  ].map((b) => ({ ...b, trades: 0, profit: 0, wins: 0 }))
  for (const t of trades) {
    const mins = (t.closeTime.getTime() - t.openTime.getTime()) / 60000
    if (!Number.isFinite(mins) || mins < 0) continue
    const b = buckets.find((x) => mins >= x.min && mins < x.max)
    if (!b) continue
    b.trades += 1
    b.profit += t.profit + t.commission + t.swap
    if (isWin(t, breakevenTickets)) b.wins += 1
  }
  return buckets
}

export function profitDistribution(trades: Trade[], bucketCount = 20, breakevenTickets: Set<number> = new Set()) {
  const filtered = trades.filter((t) => !breakevenTickets.has(t.ticket))
  if (filtered.length === 0) return [] as Array<{ label: string; count: number; from: number; to: number }>
  const values = filtered.map((t) => t.profit + t.commission + t.swap)
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return [{ label: min.toFixed(0), count: values.length, from: min, to: max }]
  const step = (max - min) / bucketCount
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    label: "",
    count: 0,
    from: min + i * step,
    to: min + (i + 1) * step,
  }))
  for (const v of values) {
    let idx = Math.floor((v - min) / step)
    if (idx >= bucketCount) idx = bucketCount - 1
    buckets[idx].count++
  }
  for (const b of buckets) {
    b.label = `${formatShort(b.from)}\u2026${formatShort(b.to)}`
  }
  return buckets
}

function formatShort(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B"
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return n.toFixed(0)
}

export function rollingWinRate(trades: Trade[], window = 20, breakevenTickets: Set<number> = new Set()) {
  const series: Array<{ index: number; winRate: number; ticket: number }> = []
  const buf: number[] = []
  trades.forEach((t, i) => {
    if (breakevenTickets.has(t.ticket)) {
      // BE-marked trades: still add a data point but don't push into the rolling buffer
      const rate = buf.length ? buf.reduce((a, b) => a + b, 0) / buf.length : 0
      series.push({ index: i, winRate: rate, ticket: t.ticket })
      return
    }
    buf.push(t.profit > 0 ? 1 : 0)
    if (buf.length > window) buf.shift()
    const rate = buf.reduce((a, b) => a + b, 0) / buf.length
    series.push({ index: i, winRate: rate, ticket: t.ticket })
  })
  return series
}

export function formatCurrency(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

export function formatCompact(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

export function formatPct(n: number, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`
}
