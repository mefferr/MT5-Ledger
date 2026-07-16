"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { ParsedStatement, Trade, LifestyleConfig } from "./types"
import { parseStatement } from "./parser"
import {
  applyTradeMerges,
  burstCandidateLegCount,
  countBurstMergeCandidates,
  DEFAULT_MERGE_SETTINGS,
  normalizeManualGroups,
  type MergeSettings,
  validateManualMerge,
} from "./trade-merge"

const STORAGE_KEY = "ledger.statement.v1"

const DEFAULT_LIFESTYLE_CONFIG: LifestyleConfig = {
  taxRate: 19, // Poland default
  taxCountry: "Poland",
  assets: [],
  goals: [],
  otherIncomeStreams: [],
  inflationRate: 4,
  investmentYieldAssumptions: 8,
  ownedItems: [],
  realEstate: [],
  bonds: [],
  baseLivingExpenses: 0,
}

type StatementMeta = Omit<ParsedStatement, "trades">

interface StatementSerialized {
  account: ParsedStatement["account"]
  initialDeposit: number
  summary: ParsedStatement["summary"]
  trades: Array<Omit<Trade, "openTime" | "closeTime"> & { openTime: string; closeTime: string }>
  balanceEntries: Array<{ ticket: number; time: string; description: string; amount: number }>
  mergeSettings?: MergeSettings
  breakevenTickets?: number[]
  lifestyleConfig?: LifestyleConfig
}

function serializeTrades(trades: Trade[]) {
  return trades.map((t) => ({
    ...t,
    openTime: t.openTime.toISOString(),
    closeTime: t.closeTime.toISOString(),
  }))
}

function deserializePayload(raw: StatementSerialized): { meta: StatementMeta; sourceTrades: Trade[] } {
  return {
    meta: {
      account: raw.account,
      initialDeposit: raw.initialDeposit,
      summary: raw.summary,
      balanceEntries: raw.balanceEntries.map((b) => ({ ...b, time: new Date(b.time) })),
    },
    sourceTrades: raw.trades.map((t) => ({
      ...t,
      openTime: new Date(t.openTime),
      closeTime: new Date(t.closeTime),
    })),
  }
}

function persist(meta: StatementMeta, sourceTrades: Trade[], mergeSettings: MergeSettings, breakevenTickets: number[], lifestyleConfig: LifestyleConfig) {
  const payload: StatementSerialized = {
    account: meta.account,
    initialDeposit: meta.initialDeposit,
    summary: meta.summary,
    balanceEntries: meta.balanceEntries.map((b) => ({ ...b, time: b.time.toISOString() })),
    trades: serializeTrades(sourceTrades),
    mergeSettings,
    breakevenTickets,
    lifestyleConfig,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota exceeded or similar */
  }
}

export interface MergeStats {
  sourceCount: number
  displayCount: number
  mergedLegCount: number
  burstGroupsAvailable: number
  burstLegsAvailable: number
  manualGroupCount: number
}

interface StatementContextValue {
  statement: ParsedStatement | null
  sourceTrades: Trade[]
  mergeSettings: MergeSettings
  mergeStats: MergeStats | null
  loading: boolean
  converting: boolean
  error: string | null
  breakevenTickets: number[]
  toggleBreakeven: (ticket: number) => void
  clearBreakevenMarks: () => void
  loadFromHtml: (html: string) => void
  loadFromMt5: (days?: number) => Promise<void>
  loadDemo: () => Promise<void>
  convertUsdToPln: () => Promise<void>
  clear: () => void
  setAutoBurstMerge: (enabled: boolean) => void
  setMergeToleranceSec: (seconds: number) => void
  addManualMerge: (ticketIds: number[]) => string | null
  removeManualMergeForTickets: (ticketIds: number[]) => void
  resetMerges: () => void
  lifestyleConfig: LifestyleConfig
  updateLifestyleConfig: (config: LifestyleConfig) => void
}

const Ctx = createContext<StatementContextValue | null>(null)

function buildMeta(parsed: ParsedStatement): StatementMeta {
  const { trades: _t, ...rest } = parsed
  return rest
}

function computeMergeStats(source: Trade[], settings: MergeSettings): MergeStats {
  const display = applyTradeMerges(source, settings)
  const valid = new Set(source.map((t) => t.ticket))
  return {
    sourceCount: source.length,
    displayCount: display.length,
    mergedLegCount: Math.max(0, source.length - display.length),
    burstGroupsAvailable: countBurstMergeCandidates(source, settings),
    burstLegsAvailable: burstCandidateLegCount(source, settings),
    manualGroupCount: normalizeManualGroups(settings.manualGroups, valid).length,
  }
}

export function StatementProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<StatementMeta | null>(null)
  const [sourceTrades, setSourceTrades] = useState<Trade[]>([])
  const [mergeSettings, setMergeSettings] = useState<MergeSettings>(DEFAULT_MERGE_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [breakevenTickets, setBreakevenTickets] = useState<number[]>([])
  const [lifestyleConfig, setLifestyleConfig] = useState<LifestyleConfig>(DEFAULT_LIFESTYLE_CONFIG)

  const statement = useMemo<ParsedStatement | null>(() => {
    if (!meta) return null
    return {
      ...meta,
      trades: applyTradeMerges(sourceTrades, mergeSettings),
    }
  }, [meta, sourceTrades, mergeSettings])

  const mergeStats = useMemo(
    () => (meta ? computeMergeStats(sourceTrades, mergeSettings) : null),
    [meta, sourceTrades, mergeSettings],
  )

  const commitParsed = useCallback((parsed: ParsedStatement, nextMerge: MergeSettings) => {
    const nextMeta = buildMeta(parsed)
    const nextSource = parsed.trades
    setMeta(nextMeta)
    setSourceTrades(nextSource)
    setMergeSettings(nextMerge)
    persist(nextMeta, nextSource, nextMerge, [], lifestyleConfig)
  }, [lifestyleConfig])

  const updateMergeSettings = useCallback(
    (next: MergeSettings) => {
      setMergeSettings(next)
      if (meta) persist(meta, sourceTrades, next, breakevenTickets, lifestyleConfig)
    },
    [meta, sourceTrades, breakevenTickets, lifestyleConfig],
  )

  const updateLifestyleConfig = useCallback(
    (next: LifestyleConfig) => {
      setLifestyleConfig(next)
      if (meta) persist(meta, sourceTrades, mergeSettings, breakevenTickets, next)
    },
    [meta, sourceTrades, mergeSettings, breakevenTickets],
  )

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as StatementSerialized
      const { meta: storedMeta, sourceTrades: storedSource } = deserializePayload(parsed)
      setMeta(storedMeta)
      setSourceTrades(storedSource)
      setMergeSettings(parsed.mergeSettings ?? DEFAULT_MERGE_SETTINGS)
      setBreakevenTickets(parsed.breakevenTickets ?? [])
      setLifestyleConfig(parsed.lifestyleConfig ?? DEFAULT_LIFESTYLE_CONFIG)
    } catch {
      /* ignore */
    }
  }, [])

  const loadFromHtml = useCallback(
    (html: string) => {
      setError(null)
      setLoading(true)
      try {
        const parsed = parseStatement(html)
        if (parsed.trades.length === 0) {
          setError("No closed trades were found in this statement.")
        }
        commitParsed(parsed, DEFAULT_MERGE_SETTINGS)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to parse statement.")
      } finally {
        setLoading(false)
      }
    },
    [commitParsed],
  )

  const loadFromMt5 = useCallback(async (days = 30) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/mt5/history?days=${days}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      })
      if (!res.ok) throw new Error("Failed to fetch history from MT5 bridge. Make sure mt5_bridge.py is running.")
      const data = await res.json()
      
      const trades: Trade[] = (data.trades || []).map((t: Record<string, unknown>) => ({
        ticket: t.ticket as number,
        openTime: new Date(t.openTime as string),
        type: t.type as TradeType,
        size: t.size as number,
        symbol: t.symbol as string,
        openPrice: t.openPrice as number,
        sl: t.sl as number,
        tp: t.tp as number,
        closeTime: new Date(t.closeTime as string),
        closePrice: t.closePrice as number,
        commission: t.commission as number,
        taxes: t.taxes as number,
        swap: t.swap as number,
        profit: t.profit as number,
      }))
      trades.sort((a, b) => (a.closeTime.getTime() || a.openTime.getTime()) - (b.closeTime.getTime() || b.openTime.getTime()))

      const balanceEntries: BalanceEntry[] = (data.balanceEntries || []).map((b: Record<string, unknown>) => ({
        ticket: b.ticket as number,
        time: new Date(b.time as string),
        description: b.description as string,
        amount: b.amount as number,
      }))

      const parsed: ParsedStatement = {
        account: {
          account: data.account?.account || "",
          name: data.account?.name || "",
          currency: data.account?.currency || "USD",
          leverage: data.account?.leverage || "",
          title: `MT5 Live — ${days} days`,
        },
        trades,
        balanceEntries,
        initialDeposit: data.initialDeposit || balanceEntries[0]?.amount || 0,
        summary: {
          closedPL: 0,
          balance: data.account?.balance || data.initialDeposit || 0,
          equity: data.account?.equity || data.initialDeposit || 0,
          freeMargin: data.account?.balance || 0,
        }
      }
      commitParsed(parsed, DEFAULT_MERGE_SETTINGS)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect to MT5 bridge.")
    } finally {
      setLoading(false)
    }
  }, [commitParsed])

  const loadDemo = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/sample-statement.htm", { cache: "force-cache" })
      if (!res.ok) throw new Error("Failed to load sample statement.")
      const html = await res.text()
      commitParsed(parseStatement(html), DEFAULT_MERGE_SETTINGS)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load demo.")
    } finally {
      setLoading(false)
    }
  }, [commitParsed])

  const clear = useCallback(() => {
    setMeta(null)
    setSourceTrades([])
    setMergeSettings(DEFAULT_MERGE_SETTINGS)
    setBreakevenTickets([])
    setLifestyleConfig(DEFAULT_LIFESTYLE_CONFIG)
    setError(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const convertUsdToPln = useCallback(async () => {
    if (!meta || meta.account.currency.toUpperCase() !== "USD") return

    setConverting(true)
    setError(null)

    try {
      const res = await fetch("https://api.nbp.pl/api/exchangerates/rates/A/USD/?format=json", {
        cache: "no-store",
      })
      if (!res.ok) throw new Error("Failed to fetch USD/PLN exchange rate.")

      const payload = (await res.json()) as { rates?: Array<{ mid?: number }> }
      const rate = payload.rates?.[0]?.mid
      if (!rate || !Number.isFinite(rate) || rate <= 0) {
        throw new Error("Received invalid USD/PLN exchange rate.")
      }

      const scaledTrades = sourceTrades.map((t) => ({
        ...t,
        commission: t.commission * rate,
        taxes: t.taxes * rate,
        swap: t.swap * rate,
        profit: t.profit * rate,
      }))

      const nextMeta: StatementMeta = {
        ...meta,
        account: { ...meta.account, currency: "PLN" },
        initialDeposit: meta.initialDeposit * rate,
        summary: meta.summary
          ? {
              closedPL:
                typeof meta.summary.closedPL === "number" ? meta.summary.closedPL * rate : undefined,
              balance: typeof meta.summary.balance === "number" ? meta.summary.balance * rate : undefined,
              equity: typeof meta.summary.equity === "number" ? meta.summary.equity * rate : undefined,
              freeMargin:
                typeof meta.summary.freeMargin === "number" ? meta.summary.freeMargin * rate : undefined,
            }
          : undefined,
        balanceEntries: meta.balanceEntries.map((b) => ({
          ...b,
          amount: b.amount * rate,
        })),
      }

      setMeta(nextMeta)
      setSourceTrades(scaledTrades)
      persist(nextMeta, scaledTrades, mergeSettings, breakevenTickets, lifestyleConfig)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert USD to PLN.")
    } finally {
      setConverting(false)
    }
  }, [meta, sourceTrades, mergeSettings, breakevenTickets, lifestyleConfig])

  const setAutoBurstMerge = useCallback(
    (enabled: boolean) => {
      updateMergeSettings({ ...mergeSettings, autoBurstMerge: enabled })
    },
    [mergeSettings, updateMergeSettings],
  )

  const setMergeToleranceSec = useCallback(
    (seconds: number) => {
      const sec = Math.max(0, Math.min(30, seconds))
      updateMergeSettings({ ...mergeSettings, toleranceMs: Math.round(sec * 1000) })
    },
    [mergeSettings, updateMergeSettings],
  )

  const addManualMerge = useCallback(
    (ticketIds: number[]): string | null => {
      const err = validateManualMerge(sourceTrades, ticketIds, mergeSettings)
      if (err) return err

      const sorted = [...new Set(ticketIds)].sort((a, b) => a - b)
      const next: MergeSettings = {
        ...mergeSettings,
        manualGroups: [...mergeSettings.manualGroups, sorted],
      }
      updateMergeSettings(next)
      return null
    },
    [sourceTrades, mergeSettings, updateMergeSettings],
  )

  const removeManualMergeForTickets = useCallback(
    (ticketIds: number[]) => {
      const pick = new Set(ticketIds)
      const nextGroups = mergeSettings.manualGroups.filter((g) => !g.some((id) => pick.has(id)))
      if (nextGroups.length === mergeSettings.manualGroups.length) return
      updateMergeSettings({ ...mergeSettings, manualGroups: nextGroups })
    },
    [mergeSettings, updateMergeSettings],
  )

  const resetMerges = useCallback(() => {
    updateMergeSettings(DEFAULT_MERGE_SETTINGS)
  }, [updateMergeSettings])

  const toggleBreakeven = useCallback(
    (ticket: number) => {
      setBreakevenTickets((prev) => {
        const next = prev.includes(ticket) ? prev.filter((id) => id !== ticket) : [...prev, ticket]
        if (meta) persist(meta, sourceTrades, mergeSettings, next, lifestyleConfig)
        return next
      })
    },
    [meta, sourceTrades, mergeSettings, lifestyleConfig],
  )

  const clearBreakevenMarks = useCallback(() => {
    setBreakevenTickets([])
    if (meta) persist(meta, sourceTrades, mergeSettings, [], lifestyleConfig)
  }, [meta, sourceTrades, mergeSettings, lifestyleConfig])

  const value = useMemo(
    () => ({
      statement,
      sourceTrades,
      mergeSettings,
      mergeStats,
      loading,
      converting,
      error,
      breakevenTickets,
      toggleBreakeven,
      clearBreakevenMarks,
      loadFromHtml,
      loadFromMt5,
      loadDemo,
      convertUsdToPln,
      clear,
      setAutoBurstMerge,
      setMergeToleranceSec,
      addManualMerge,
      removeManualMergeForTickets,
      resetMerges,
      lifestyleConfig,
      updateLifestyleConfig,
    }),
    [
      statement,
      sourceTrades,
      mergeSettings,
      mergeStats,
      loading,
      converting,
      error,
      breakevenTickets,
      toggleBreakeven,
      clearBreakevenMarks,
      loadFromHtml,
      loadFromMt5,
      loadDemo,
      convertUsdToPln,
      clear,
      setAutoBurstMerge,
      setMergeToleranceSec,
      addManualMerge,
      removeManualMergeForTickets,
      resetMerges,
      lifestyleConfig,
      updateLifestyleConfig,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStatement() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useStatement must be used within StatementProvider")
  return ctx
}
