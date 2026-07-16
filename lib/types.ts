export type TradeType = "buy" | "sell"

export type MergeKind = "burst" | "manual"

export interface Trade {
  ticket: number
  openTime: Date
  type: TradeType
  size: number
  symbol: string
  openPrice: number
  sl: number
  tp: number
  closeTime: Date
  closePrice: number
  commission: number
  taxes: number
  swap: number
  profit: number
  closedBy?: "sl" | "tp"
  /** Source tickets combined into this row (when merged). */
  mergeLegs?: number[]
  mergeKind?: MergeKind
}

export interface BalanceEntry {
  ticket: number
  time: Date
  description: string
  amount: number
}

export interface AccountInfo {
  account: string
  name: string
  currency: string
  leverage: string
  statementDate?: string
  title?: string
}

export interface ParsedStatement {
  account: AccountInfo
  trades: Trade[]
  balanceEntries: BalanceEntry[]
  initialDeposit: number
  summary?: {
    closedPL?: number
    balance?: number
    equity?: number
    freeMargin?: number
  }
}

export type AssetType = "real_estate" | "vehicle" | "investment" | "cash" | "other"

export type ExpenseType = "needs" | "wants"

export interface ExpenseItem {
  id: string
  category: string
  amount: number
  type: ExpenseType
}

export interface IncomeStream {
  id: string
  name: string
  amount: number
}

export interface AssetItem {
  id: string
  name: string
  value: number
  type: AssetType
  annualYield?: number
}

export interface GoalItem {
  id: string
  name: string
  target: number
}

export interface LifestyleConfig {
  taxRate: number // default 19 for Poland
  taxCountry: string // e.g. "Poland"
  assets: AssetItem[]
  goals: GoalItem[]
  otherIncomeStreams: IncomeStream[]
  inflationRate: number
  investmentYieldAssumptions: number
  
  ownedItems: CatalogItem[]
  realEstate: RealEstateAsset[]
  bonds: BondAsset[]
  
  tycoonState?: TycoonState
}

export interface TycoonState {
  isStarted: boolean
  month: number
  year: number
  liquidCash: number
  history: TycoonHistoryPoint[]
}

export interface TycoonHistoryPoint {
  monthIndex: number
  liquidCash: number
  netWorth: number
}

export interface CatalogItem {
  id: string
  category: string
  name: string
  price: number
  monthlyMaintenance: number
  image: string
  type?: "asset" | "subscription"
  annualYield?: number
  monthlyRent?: number
}

export interface RealEstateAsset {
  id: string
  name: string
  purchasePrice: number
  monthlyRent: number
  monthlyMaintenance: number
}

export interface BondAsset {
  id: string
  name: string
  principal: number
  annualYield: number
  autoInvestPct?: number
}
