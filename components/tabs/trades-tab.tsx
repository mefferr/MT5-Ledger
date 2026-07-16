"use client"

import { Fragment, useMemo, useState } from "react"
import { useStatement } from "@/lib/store"
import { formatCurrency } from "@/lib/analytics"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { ArrowDownUp, Download, Equal, GitMerge, Search, Undo2 } from "lucide-react"
import type { Trade } from "@/lib/types"

type SortKey = "ticket" | "openTime" | "closeTime" | "symbol" | "type" | "size" | "profit" | "duration"

export function TradesTab() {
  const {
    statement,
    sourceTrades,
    mergeSettings,
    mergeStats,
    breakevenTickets,
    addManualMerge,
    removeManualMergeForTickets,
    setAutoBurstMerge,
    setMergeToleranceSec,
    resetMerges,
    toggleBreakeven,
    clearBreakevenMarks,
  } = useStatement()

  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "wins" | "losses" | "buys" | "sells" | "sl" | "tp" | "merged" | "breakeven">("all")
  const [sortKey, setSortKey] = useState<SortKey>("closeTime")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [mergeMode, setMergeMode] = useState(false)
  const [selectedTickets, setSelectedTickets] = useState<number[]>([])
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [expandedTickets, setExpandedTickets] = useState<number[]>([])

  const displayTrades = statement?.trades ?? []
  const currency = statement?.account.currency ?? "USD"
  const tableTrades = mergeMode ? sourceTrades : displayTrades

  const ticketsInManualGroup = useMemo(() => {
    const set = new Set<number>()
    for (const g of mergeSettings.manualGroups) {
      for (const id of g) set.add(id)
    }
    return set
  }, [mergeSettings.manualGroups])

  const breakevenSet = useMemo(() => new Set(breakevenTickets), [breakevenTickets])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const res = tableTrades.filter((t) => {
      if (filter === "wins" && t.profit <= 0) return false
      if (filter === "losses" && t.profit >= 0) return false
      if (filter === "buys" && t.type !== "buy") return false
      if (filter === "sells" && t.type !== "sell") return false
      if (filter === "sl" && t.closedBy !== "sl") return false
      if (filter === "tp" && t.closedBy !== "tp") return false
      if (filter === "merged" && !t.mergeLegs?.length) return false
      if (filter === "breakeven" && !breakevenSet.has(t.ticket)) return false
      if (!q) return true
      const legStr = t.mergeLegs?.join(" ") ?? ""
      return (
        String(t.ticket).includes(q) ||
        t.symbol.toLowerCase().includes(q) ||
        t.type.includes(q) ||
        legStr.includes(q)
      )
    })
    const dir = sortDir === "asc" ? 1 : -1
    res.sort((a, b) => {
      switch (sortKey) {
        case "ticket":
          return (a.ticket - b.ticket) * dir
        case "openTime":
          return (a.openTime.getTime() - b.openTime.getTime()) * dir
        case "closeTime":
          return (a.closeTime.getTime() - b.closeTime.getTime()) * dir
        case "symbol":
          return a.symbol.localeCompare(b.symbol) * dir
        case "type":
          return a.type.localeCompare(b.type) * dir
        case "size":
          return (a.size - b.size) * dir
        case "profit":
          return (a.profit - b.profit) * dir
        case "duration":
          return (
            (a.closeTime.getTime() - a.openTime.getTime() -
              (b.closeTime.getTime() - b.openTime.getTime())) *
            dir
          )
      }
    })
    return res
  }, [tableTrades, query, filter, sortKey, sortDir, breakevenSet])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(k)
      setSortDir(k === "ticket" || k === "symbol" ? "asc" : "desc")
    }
  }

  function toggleSelect(ticket: number) {
    setMergeError(null)
    setSelectedTickets((prev) =>
      prev.includes(ticket) ? prev.filter((id) => id !== ticket) : [...prev, ticket],
    )
  }

  function handleManualMerge() {
    const err = addManualMerge(selectedTickets)
    if (err) {
      setMergeError(err)
      return
    }
    setSelectedTickets([])
    setMergeMode(false)
    setMergeError(null)
  }

  const exportCsv = () => {
    const header = [
      "ticket",
      "merge_legs",
      "open_time",
      "type",
      "size",
      "symbol",
      "open_price",
      "sl",
      "tp",
      "close_time",
      "close_price",
      "commission",
      "swap",
      "profit",
      "closed_by",
      "merge_kind",
    ]
    const rows = filtered.map((t) => [
      t.ticket,
      t.mergeLegs?.join("|") ?? "",
      t.openTime.toISOString(),
      t.type,
      t.size,
      t.symbol,
      t.openPrice,
      t.sl,
      t.tp,
      t.closeTime.toISOString(),
      t.closePrice,
      t.commission,
      t.swap,
      t.profit,
      t.closedBy ?? "",
      t.mergeKind ?? "",
    ])
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!statement) return null

  const FILTER_OPTIONS: Array<{ id: typeof filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "wins", label: "Wins" },
    { id: "losses", label: "Losses" },
    { id: "buys", label: "Buys" },
    { id: "sells", label: "Sells" },
    { id: "merged", label: "Merged" },
    { id: "breakeven", label: `BE (${breakevenTickets.length})` },
    { id: "sl", label: "Hit SL" },
    { id: "tp", label: "Hit TP" },
  ]

  const hasActiveMerges =
    mergeSettings.autoBurstMerge ||
    mergeSettings.manualGroups.length > 0 ||
    (mergeStats?.mergedLegCount ?? 0) > 0

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Position merging</h3>
            <p className="max-w-xl text-xs text-muted-foreground">
              Brokers often split one logical trade into several tickets. Auto-merge combines legs with the same
              symbol, direction, and open/close time (within a tolerance). Use manual merge for scale-ins, partial
              exits, or any custom grouping.
            </p>
            {mergeStats && mergeStats.burstGroupsAvailable > 0 && !mergeSettings.autoBurstMerge && (
              <p className="text-xs text-primary">
                {mergeStats.burstGroupsAvailable} burst group
                {mergeStats.burstGroupsAvailable === 1 ? "" : "s"} detected (
                {mergeStats.burstLegsAvailable} legs) — enable auto-merge to combine them.
              </p>
            )}
            {mergeStats && mergeStats.mergedLegCount > 0 && (
              <p className="font-mono text-xs text-muted-foreground">
                Showing {mergeStats.displayCount} trades from {mergeStats.sourceCount} positions (
                {mergeStats.mergedLegCount} legs merged
                {mergeStats.manualGroupCount > 0 ? `, ${mergeStats.manualGroupCount} manual` : ""})
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">Burst tolerance</span>
              <select
                className="bg-transparent font-mono text-foreground outline-none"
                value={mergeSettings.toleranceMs / 1000}
                onChange={(e) => setMergeToleranceSec(Number(e.target.value))}
              >
                {[0, 1, 2, 5, 10].map((s) => (
                  <option key={s} value={s}>
                    {s}s
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant={mergeSettings.autoBurstMerge ? "default" : "outline"}
              onClick={() => setAutoBurstMerge(!mergeSettings.autoBurstMerge)}
            >
              <GitMerge className="mr-2 h-3.5 w-3.5" />
              {mergeSettings.autoBurstMerge ? "Auto-merge on" : "Auto-merge burst legs"}
            </Button>
            <Button
              size="sm"
              variant={mergeMode ? "default" : "outline"}
              onClick={() => {
                setMergeMode((m) => !m)
                setSelectedTickets([])
                setMergeError(null)
              }}
            >
              Manual merge
            </Button>
            {hasActiveMerges && (
              <Button size="sm" variant="ghost" onClick={resetMerges}>
                <Undo2 className="mr-2 h-3.5 w-3.5" /> Reset merges
              </Button>
            )}
          </div>
        </div>

        {mergeMode && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <span className="text-xs text-muted-foreground">
              Raw positions — select 2+ with same symbol and direction, then merge.
            </span>
            <Button size="sm" disabled={selectedTickets.length < 2} onClick={handleManualMerge}>
              Merge selected ({selectedTickets.length})
            </Button>
            {mergeError && <span className="text-xs text-destructive">{mergeError}</span>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticket or symbol…"
              className="h-9 w-56 pl-8 bg-card"
            />
          </div>
          <div className="thin-scroll flex max-w-[520px] items-center gap-1 overflow-x-auto rounded-md border border-border bg-card p-1">
            {FILTER_OPTIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded px-3 py-1 text-xs transition-colors",
                  filter === f.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            {filtered.length} of {tableTrades.length} {mergeMode ? "positions" : "trades"}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="thin-scroll max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card/95 text-left backdrop-blur">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {mergeMode && <th className="w-10 px-2 py-2" />}
                <Th onClick={() => toggleSort("ticket")} active={sortKey === "ticket"} dir={sortDir}>
                  #
                </Th>
                <Th onClick={() => toggleSort("openTime")} active={sortKey === "openTime"} dir={sortDir}>
                  Open
                </Th>
                <Th onClick={() => toggleSort("type")} active={sortKey === "type"} dir={sortDir}>
                  Type
                </Th>
                <Th onClick={() => toggleSort("size")} active={sortKey === "size"} dir={sortDir}>
                  Size
                </Th>
                <Th onClick={() => toggleSort("symbol")} active={sortKey === "symbol"} dir={sortDir}>
                  Symbol
                </Th>
                <th className="px-3 py-2 font-medium">Open px</th>
                <th className="px-3 py-2 font-medium">SL</th>
                <th className="px-3 py-2 font-medium">TP</th>
                <Th onClick={() => toggleSort("closeTime")} active={sortKey === "closeTime"} dir={sortDir}>
                  Close
                </Th>
                <th className="px-3 py-2 font-medium">Close px</th>
                <Th onClick={() => toggleSort("duration")} active={sortKey === "duration"} dir={sortDir}>
                  Duration
                </Th>
                <th className="px-3 py-2 font-medium">Comm</th>
                <th className="px-3 py-2 font-medium">Swap</th>
                <Th onClick={() => toggleSort("profit")} active={sortKey === "profit"} dir={sortDir} align="right">
                  P/L
                </Th>
                {!mergeMode && <th className="px-3 py-2 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const isExpanded = expandedTickets.includes(t.ticket)
                const legDetails =
                  !mergeMode && t.mergeLegs && t.mergeLegs.length > 1
                    ? sourceTrades.filter((s) => t.mergeLegs!.includes(s.ticket))
                    : []
                const inManualGroup = mergeMode && ticketsInManualGroup.has(t.ticket)

                return (
                  <Fragment key={t.ticket}>
                    <TradeRow
                      t={t}
                      currency={currency}
                      mergeMode={mergeMode}
                      selected={selectedTickets.includes(t.ticket)}
                      disabled={inManualGroup}
                      onToggleSelect={() => toggleSelect(t.ticket)}
                      showActions={!mergeMode}
                      isBreakeven={breakevenSet.has(t.ticket)}
                      onToggleBreakeven={() => toggleBreakeven(t.ticket)}
                      onUnmerge={
                        t.mergeKind === "manual" && t.mergeLegs
                          ? () => removeManualMergeForTickets(t.mergeLegs!)
                          : undefined
                      }
                      onToggleExpand={
                        legDetails.length > 0
                          ? () =>
                              setExpandedTickets((prev) =>
                                prev.includes(t.ticket)
                                  ? prev.filter((id) => id !== t.ticket)
                                  : [...prev, t.ticket],
                              )
                          : undefined
                      }
                      expanded={isExpanded}
                    />
                    {isExpanded &&
                      legDetails.map((leg) => (
                        <tr
                          key={`leg-${t.ticket}-${leg.ticket}`}
                          className="border-t border-border/40 bg-secondary/20"
                        >
                          <td colSpan={mergeMode ? 15 : 16} className="px-3 py-1.5">
                            <LegSummary leg={leg} currency={currency} />
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={mergeMode ? 15 : 16} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No trades match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Th({
  children,
  onClick,
  active,
  dir,
  align,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  dir?: "asc" | "desc"
  align?: "right"
}) {
  return (
    <th className={cn("px-3 py-2 font-medium", align === "right" && "text-right")}>
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wider",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {children}
        <ArrowDownUp className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
      </button>
    </th>
  )
}

function TradeRow({
  t,
  currency,
  mergeMode,
  selected,
  disabled,
  onToggleSelect,
  showActions,
  isBreakeven,
  onToggleBreakeven,
  onUnmerge,
  onToggleExpand,
  expanded,
}: {
  t: Trade
  currency: string
  mergeMode: boolean
  selected: boolean
  disabled: boolean
  onToggleSelect: () => void
  showActions: boolean
  isBreakeven: boolean
  onToggleBreakeven: () => void
  onUnmerge?: () => void
  onToggleExpand?: () => void
  expanded?: boolean
}) {
  const durationMs = t.closeTime.getTime() - t.openTime.getTime()
  const legCount = t.mergeLegs?.length ?? 0

  return (
    <tr
      className={cn(
        "border-t border-border/60 hover:bg-secondary/40",
        disabled && "opacity-50",
        selected && "bg-primary/5",
      )}
    >
      {mergeMode && (
        <td className="px-2 py-2">
          <Checkbox
            checked={selected}
            disabled={disabled}
            onCheckedChange={onToggleSelect}
            aria-label={`Select ticket ${t.ticket}`}
          />
        </td>
      )}
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
        <div className="flex flex-col gap-0.5">
          <span>
            {t.ticket}
            {legCount > 1 && (
              <span className="ml-1 text-[10px] text-primary">+{legCount - 1}</span>
            )}
          </span>
          {t.mergeKind && (
            <span className="text-[9px] uppercase text-muted-foreground">{t.mergeKind}</span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
        {t.openTime.toLocaleString("en-GB", { hour12: false })}
      </td>
      <td className="px-3 py-2">
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
      </td>
      <td className="px-3 py-2 font-mono tnum">{t.size.toFixed(2)}</td>
      <td className="px-3 py-2 font-medium uppercase">{t.symbol}</td>
      <td className="px-3 py-2 font-mono tnum">{t.openPrice.toFixed(3)}</td>
      <td className="px-3 py-2 font-mono tnum text-muted-foreground">
        {t.sl ? t.sl.toFixed(3) : "—"}
      </td>
      <td className="px-3 py-2 font-mono tnum text-muted-foreground">
        {t.tp ? t.tp.toFixed(3) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
        {t.closeTime.toLocaleString("en-GB", { hour12: false })}
      </td>
      <td className="px-3 py-2 font-mono tnum">{t.closePrice.toFixed(3)}</td>
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
        {formatDurationShort(durationMs)}
        {t.closedBy && (
          <span
            className={cn(
              "ml-1.5 rounded border px-1 text-[9px] uppercase",
              t.closedBy === "sl"
                ? "border-destructive/40 text-destructive"
                : "border-primary/40 text-primary",
            )}
          >
            {t.closedBy}
          </span>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
        {t.commission.toFixed(2)}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{t.swap.toFixed(2)}</td>
      <td
        className={cn(
          "px-3 py-2 text-right font-mono tnum",
          t.profit > 0 ? "text-primary" : t.profit < 0 ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {t.profit >= 0 ? "+" : ""}
        {formatCurrency(t.profit, currency)}
      </td>
      {showActions && (
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 px-2 text-xs",
                isBreakeven
                  ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 hover:text-amber-300"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={onToggleBreakeven}
              title={isBreakeven ? "Unmark breakeven" : "Mark as breakeven (exclude from avg win/loss)"}
            >
              <Equal className="mr-1 h-3 w-3" />
              BE
            </Button>
            {onToggleExpand && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onToggleExpand}>
                {expanded ? "Hide" : "Legs"}
              </Button>
            )}
            {onUnmerge && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onUnmerge}>
                Unmerge
              </Button>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}

function LegSummary({ leg, currency }: { leg: Trade; currency: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pl-6 font-mono text-[11px] text-muted-foreground">
      <span>#{leg.ticket}</span>
      <span>{leg.size.toFixed(2)} lots</span>
      <span>
        {leg.openPrice.toFixed(3)} → {leg.closePrice.toFixed(3)}
      </span>
      <span className={leg.profit >= 0 ? "text-primary" : "text-destructive"}>
        {formatCurrency(leg.profit, currency)}
      </span>
    </div>
  )
}

function formatDurationShort(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "—"
  const mins = ms / 60000
  if (mins < 60) return `${mins.toFixed(0)}m`
  const hours = mins / 60
  if (hours < 24) return `${hours.toFixed(1)}h`
  const days = hours / 24
  return `${days.toFixed(1)}d`
}
