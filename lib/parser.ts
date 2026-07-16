import type { ParsedStatement, Trade, BalanceEntry, AccountInfo, TradeType } from "./types"

// Parse a number like "1 234.56" or "2 030 096 295.25"
function parseNum(raw: string | null | undefined): number {
  if (!raw) return 0
  const cleaned = raw.replace(/\u00a0/g, " ").replace(/\s/g, "").replace(/,/g, "")
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

const MT_DATETIME_RE = /^\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2}$/

// Parse MT4/MT5 date like "2024.02.28 08:07:44"
function parseDate(raw: string | null | undefined): Date {
  if (!raw) return new Date(NaN)
  const trimmed = raw.trim()
  const m = trimmed.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (m) {
    const [, y, mo, d, h, mi, s] = m
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  }
  const fallback = new Date(trimmed.replace(/\./g, "-"))
  return fallback
}

function isTerminalDateTime(s: string): boolean {
  return MT_DATETIME_RE.test(s.trim())
}

function txt(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\u00a0/g, " ").trim()
}

function isDigitsTicket(s: string): boolean {
  return /^\d+$/.test(s.replace(/\s/g, ""))
}

/** MT5 "Positions" / localized history: open time, position id, symbol, type, then a hidden colspan td. */
function isMt5PositionRowLayout(cells: HTMLElement[]): boolean {
  if (cells.length !== 14) return false
  const h = cells[4]
  if (!h || h.tagName !== "TD") return false
  if (h.classList.contains("hidden")) return true
  const cs = Number.parseInt(h.getAttribute("colspan") || "0", 10)
  return cs >= 4
}

function applyThAccountRow(account: AccountInfo, labelRaw: string, valueRaw: string) {
  const label = labelRaw.replace(/:\s*$/i, "").trim()
  const L = label.toLowerCase()
  const value = valueRaw.trim()
  if (!value) return

  if (L === "name" || L === "nazwa" || L === "имя") account.name = value
  else if (L === "account" || L === "rachunek" || L === "счёт" || L === "счет") {
    account.account = value
    const cur = value.match(/\(\s*([A-Z]{3})\s*,/i)
    if (cur) account.currency = cur[1].toUpperCase()
  } else if (L === "currency" || L === "waluta" || L === "валюта") account.currency = value
  else if (L === "leverage" || L === "dźwignia" || L === "плечо") account.leverage = value
  else if (L === "date" || L === "data" || L === "дата") account.statementDate = value
}

function parseAccountFromThHeaderRows(doc: Document, account: AccountInfo) {
  for (const row of doc.querySelectorAll("tr")) {
    const ths = row.querySelectorAll(":scope > th")
    if (ths.length < 2) continue
    const label = txt(ths[0])
    const valueEl = (ths[1].querySelector("b") as HTMLElement | null) ?? (ths[1] as HTMLElement)
    applyThAccountRow(account, label, txt(valueEl))
  }
}

function tryParseMt5PositionTrade(cells: HTMLElement[]): Trade | null {
  if (!isMt5PositionRowLayout(cells)) return null
  const openTimeStr = txt(cells[0])
  if (!isTerminalDateTime(openTimeStr)) return null

  const typeTxt = txt(cells[3]).toLowerCase()
  if (typeTxt !== "buy" && typeTxt !== "sell") return null

  const ticketTxt = txt(cells[1])
  if (!isDigitsTicket(ticketTxt)) return null
  const ticketNum = Number.parseInt(ticketTxt.replace(/\s/g, ""), 10)
  if (!Number.isFinite(ticketNum)) return null

  const symbol = txt(cells[2]).toUpperCase()
  if (!symbol || symbol === "BALANCE") return null

  const trade: Trade = {
    ticket: ticketNum,
    openTime: parseDate(openTimeStr),
    type: typeTxt as TradeType,
    size: parseNum(txt(cells[5])),
    symbol,
    openPrice: parseNum(txt(cells[6])),
    sl: parseNum(txt(cells[7])),
    tp: parseNum(txt(cells[8])),
    closeTime: parseDate(txt(cells[9])),
    closePrice: parseNum(txt(cells[10])),
    commission: parseNum(txt(cells[11])),
    taxes: 0,
    swap: parseNum(txt(cells[12])),
    profit: parseNum(txt(cells[13])),
  }

  const titleAttr = (cells[1].getAttribute("title") || "").toLowerCase()
  if (titleAttr.includes("[sl]")) trade.closedBy = "sl"
  else if (titleAttr.includes("[tp]")) trade.closedBy = "tp"

  return trade
}

function tryParseMt4TradeRow(cells: HTMLElement[]): Trade | null {
  if (cells.length !== 14) return null
  if (isMt5PositionRowLayout(cells)) return null

  const ticketTxt = txt(cells[0])
  const typeTxt = txt(cells[2]).toLowerCase()
  const ticketNum = Number.parseInt(ticketTxt, 10)
  if (!Number.isFinite(ticketNum)) return null
  if (typeTxt === "balance") return null
  if (typeTxt !== "buy" && typeTxt !== "sell") return null

  const trade: Trade = {
    ticket: ticketNum,
    openTime: parseDate(txt(cells[1])),
    type: typeTxt as TradeType,
    size: parseNum(txt(cells[3])),
    symbol: txt(cells[4]).toUpperCase(),
    openPrice: parseNum(txt(cells[5])),
    sl: parseNum(txt(cells[6])),
    tp: parseNum(txt(cells[7])),
    closeTime: parseDate(txt(cells[8])),
    closePrice: parseNum(txt(cells[9])),
    commission: parseNum(txt(cells[10])),
    taxes: parseNum(txt(cells[11])),
    swap: parseNum(txt(cells[12])),
    profit: parseNum(txt(cells[13])),
  }

  const titleAttr = (cells[0].getAttribute("title") || "").toLowerCase()
  if (titleAttr.includes("[sl]")) trade.closedBy = "sl"
  else if (titleAttr.includes("[tp]")) trade.closedBy = "tp"

  return trade
}

/** MT5 deals grid: Time, Deal, Symbol, Type, Direction, … hidden cost column, commission, fee, swap, profit, balance, comment */
function tryParseMt5DealsBalanceRow(cells: HTMLElement[]): BalanceEntry | null {
  if (cells.length < 15) return null
  const t3 = txt(cells[3]).toLowerCase()
  if (t3 !== "balance" && t3 !== "credit") return null
  const hidden = cells[8]
  if (!hidden?.classList.contains("hidden")) return null

  const ticketNum = Number.parseInt(txt(cells[1]).replace(/\s/g, ""), 10)
  const when = parseDate(txt(cells[0]))
  if (!Number.isFinite(ticketNum) || Number.isNaN(when.getTime())) return null

  const amount = parseNum(txt(cells[12]))
  const desc = txt(cells[14]) || t3
  return { ticket: ticketNum, time: when, description: desc, amount }
}

export function parseStatement(html: string): ParsedStatement {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  const account: AccountInfo = {
    account: "",
    name: "",
    currency: "USD",
    leverage: "",
  }

  const title = doc.querySelector("title")?.textContent?.trim()
  if (title) account.title = title

  parseAccountFromThHeaderRows(doc, account)

  const allCells = Array.from(doc.querySelectorAll("td"))
  for (const cell of allCells) {
    const b = cell.querySelector("b")
    const t = txt(b)
    if (!t) continue
    if (t.startsWith("Account:")) account.account = t.replace("Account:", "").trim()
    else if (t.startsWith("Name:")) account.name = t.replace("Name:", "").trim()
    else if (t.startsWith("Currency:")) account.currency = t.replace("Currency:", "").trim()
    else if (t.startsWith("Leverage:")) account.leverage = t.replace("Leverage:", "").trim()
  }

  const acctCurrency = account.account.match(/\(\s*([A-Z]{3})\s*,/i)
  if (acctCurrency) account.currency = acctCurrency[1].toUpperCase()

  const trades: Trade[] = []
  const balanceEntries: BalanceEntry[] = []
  let initialDeposit = 0
  let lastTrade: Trade | null = null

  const rows = Array.from(doc.querySelectorAll("tr"))
  for (const row of rows) {
    const cells = Array.from(row.children) as HTMLElement[]
    if (cells.length === 0) continue

    if (lastTrade && cells.length <= 3) {
      const joined = cells.map((c) => txt(c)).join(" ").toLowerCase()
      if (joined.includes("[sl]")) lastTrade.closedBy = "sl"
      else if (joined.includes("[tp]")) lastTrade.closedBy = "tp"
    }

    const mt5Bal = tryParseMt5DealsBalanceRow(cells)
    if (mt5Bal) {
      balanceEntries.push(mt5Bal)
      lastTrade = null
      continue
    }

    const mt5Trade = tryParseMt5PositionTrade(cells)
    if (mt5Trade) {
      trades.push(mt5Trade)
      lastTrade = mt5Trade
      continue
    }

    const mt4Trade = tryParseMt4TradeRow(cells)
    if (mt4Trade) {
      trades.push(mt4Trade)
      lastTrade = mt4Trade
      continue
    }

    if (cells.length >= 4) {
      const typeTxt = txt(cells[2]).toLowerCase()
      if (typeTxt === "balance" || typeTxt === "credit") {
        const ticketNum = Number.parseInt(txt(cells[0]), 10)
        const when = parseDate(txt(cells[1]))
        const desc = txt(cells[3])
        const amt = parseNum(txt(cells[cells.length - 1]))
        if (Number.isFinite(ticketNum) && !Number.isNaN(when.getTime())) {
          balanceEntries.push({ ticket: ticketNum, time: when, description: desc, amount: amt })
          if (/initial deposit/i.test(desc) || ticketNum === 0) {
            initialDeposit = amt
          }
          lastTrade = null
        }
      }
    }
  }

  const summary: ParsedStatement["summary"] = {}
  const textAll = doc.body?.textContent ?? ""
  const grab = (label: string) => {
    const re = new RegExp(label + "[:\\s]*([-\\d\\s.,]+)", "i")
    const m = textAll.match(re)
    if (m) return parseNum(m[1])
    return undefined
  }

  summary.closedPL = grab("Closed Trade P/L") ?? grab("Closed P/L")
  summary.balance = grab("Balance") ?? grab("Saldo") ?? grab("Баланс")
  summary.equity = grab("Equity") ?? grab("Kapitał")
  summary.freeMargin = grab("Free Margin") ?? grab("Dostępny Depozyt") ?? grab("Margin")

  trades.sort((a, b) => {
    const at = a.closeTime.getTime() || a.openTime.getTime()
    const bt = b.closeTime.getTime() || b.openTime.getTime()
    return at - bt
  })

  if (!initialDeposit && balanceEntries.length > 0) {
    const positives = balanceEntries.filter((e) => e.amount > 0)
    if (positives.length) {
      positives.sort((a, b) => a.time.getTime() - b.time.getTime())
      initialDeposit = positives[0].amount
    }
  }

  return {
    account,
    trades,
    balanceEntries,
    initialDeposit: initialDeposit || balanceEntries[0]?.amount || 0,
    summary,
  }
}
