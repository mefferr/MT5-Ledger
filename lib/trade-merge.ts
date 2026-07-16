import type { Trade } from "./types"

export type MergeKind = "burst" | "manual"

export interface MergeSettings {
  /** Merge multiple legs opened and closed in the same time window (broker lot splits). */
  autoBurstMerge: boolean
  /** Time window (ms) for treating open/close times as simultaneous. */
  toleranceMs: number
  /** Each entry is a set of source ticket IDs merged manually by the user. */
  manualGroups: number[][]
}

export const DEFAULT_MERGE_SETTINGS: MergeSettings = {
  autoBurstMerge: false,
  toleranceMs: 2000,
  manualGroups: [],
}

function timeBucket(d: Date, toleranceMs: number): number {
  return Math.floor(d.getTime() / toleranceMs)
}

/** Groups trades opened and closed within the same tolerance window. */
export function burstGroupKey(t: Trade, toleranceMs: number): string {
  const openK = timeBucket(t.openTime, toleranceMs)
  const closeK = timeBucket(t.closeTime, toleranceMs)
  return `${t.symbol}|${t.type}|${openK}|${closeK}`
}

export function mergeTradeLegs(legs: Trade[], kind: MergeKind): Trade {
  if (legs.length === 0) throw new Error("Cannot merge empty trade list")
  if (legs.length === 1) return { ...legs[0] }

  const sorted = [...legs].sort((a, b) => a.ticket - b.ticket)
  const symbol = sorted[0].symbol
  const type = sorted[0].type
  const totalSize = sorted.reduce((s, t) => s + t.size, 0)

  const openPrice =
    totalSize > 0
      ? sorted.reduce((s, t) => s + t.openPrice * t.size, 0) / totalSize
      : sorted[0].openPrice
  const closePrice =
    totalSize > 0
      ? sorted.reduce((s, t) => s + t.closePrice * t.size, 0) / totalSize
      : sorted[0].closePrice

  const openTime = new Date(Math.min(...sorted.map((t) => t.openTime.getTime())))
  const closeTime = new Date(Math.max(...sorted.map((t) => t.closeTime.getTime())))

  const slLeg = sorted.find((t) => t.sl > 0)
  const tpLeg = sorted.find((t) => t.tp > 0)
  const closedBy = sorted.find((t) => t.closedBy)?.closedBy

  return {
    ticket: sorted[0].ticket,
    openTime,
    type,
    size: totalSize,
    symbol,
    openPrice,
    sl: slLeg?.sl ?? sorted[0].sl,
    tp: tpLeg?.tp ?? sorted[0].tp,
    closeTime,
    closePrice,
    commission: sorted.reduce((s, t) => s + t.commission, 0),
    taxes: sorted.reduce((s, t) => s + t.taxes, 0),
    swap: sorted.reduce((s, t) => s + t.swap, 0),
    profit: sorted.reduce((s, t) => s + t.profit, 0),
    closedBy,
    mergeLegs: sorted.map((t) => t.ticket),
    mergeKind: kind,
  }
}

function ticketsInManualGroups(settings: MergeSettings): Set<number> {
  const set = new Set<number>()
  for (const g of settings.manualGroups) {
    for (const id of g) set.add(id)
  }
  return set
}

export function countBurstMergeCandidates(trades: Trade[], settings: MergeSettings): number {
  const manualTickets = ticketsInManualGroups(settings)
  const remaining = trades.filter((t) => !manualTickets.has(t.ticket))
  const groups = new Map<string, Trade[]>()
  for (const t of remaining) {
    const key = burstGroupKey(t, settings.toleranceMs)
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }
  let groupsToMerge = 0
  let legsInGroups = 0
  for (const legs of groups.values()) {
    if (legs.length >= 2) {
      groupsToMerge += 1
      legsInGroups += legs.length
    }
  }
  return groupsToMerge
}

export function burstCandidateLegCount(trades: Trade[], settings: MergeSettings): number {
  const manualTickets = ticketsInManualGroups(settings)
  const remaining = trades.filter((t) => !manualTickets.has(t.ticket))
  const groups = new Map<string, Trade[]>()
  for (const t of remaining) {
    const key = burstGroupKey(t, settings.toleranceMs)
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }
  let legs = 0
  for (const g of groups.values()) {
    if (g.length >= 2) legs += g.length
  }
  return legs
}

export function applyTradeMerges(source: Trade[], settings: MergeSettings): Trade[] {
  const used = new Set<number>()
  const result: Trade[] = []
  const byTicket = new Map(source.map((t) => [t.ticket, t]))

  for (const group of settings.manualGroups) {
    const legs = group
      .map((id) => byTicket.get(id))
      .filter((t): t is Trade => !!t && !used.has(t.ticket))
    if (legs.length < 2) continue
    if (!canMergeLegs(legs)) continue
    result.push(mergeTradeLegs(legs, "manual"))
    for (const t of legs) used.add(t.ticket)
  }

  const remaining = source.filter((t) => !used.has(t.ticket))

  if (settings.autoBurstMerge) {
    const groups = new Map<string, Trade[]>()
    for (const t of remaining) {
      const key = burstGroupKey(t, settings.toleranceMs)
      const arr = groups.get(key) ?? []
      arr.push(t)
      groups.set(key, arr)
    }
    for (const legs of groups.values()) {
      if (legs.length >= 2) {
        result.push(mergeTradeLegs(legs, "burst"))
      } else {
        result.push(legs[0])
      }
    }
  } else {
    result.push(...remaining)
  }

  result.sort((a, b) => {
    const at = a.closeTime.getTime() || a.openTime.getTime()
    const bt = b.closeTime.getTime() || b.openTime.getTime()
    return at - bt
  })

  return result
}

export function canMergeLegs(legs: Trade[]): boolean {
  if (legs.length < 2) return false
  const symbol = legs[0].symbol
  const type = legs[0].type
  return legs.every((t) => t.symbol === symbol && t.type === type)
}

export function validateManualMerge(source: Trade[], ticketIds: number[], settings: MergeSettings): string | null {
  if (ticketIds.length < 2) return "Select at least 2 trades to merge."

  const manualTickets = ticketsInManualGroups(settings)
  const legs = ticketIds
    .map((id) => source.find((t) => t.ticket === id))
    .filter((t): t is Trade => !!t)

  if (legs.length !== ticketIds.length) return "One or more selected trades were not found."
  if (legs.some((t) => manualTickets.has(t.ticket))) {
    return "One or more trades are already part of a manual merge. Unmerge them first."
  }
  if (!canMergeLegs(legs)) {
    return "Merged trades must share the same symbol and direction (buy or sell)."
  }
  return null
}

/** Normalize manual groups after tickets are removed from source. */
export function normalizeManualGroups(groups: number[][], validTickets: Set<number>): number[][] {
  return groups
    .map((g) => g.filter((id) => validTickets.has(id)))
    .filter((g) => g.length >= 2)
}
