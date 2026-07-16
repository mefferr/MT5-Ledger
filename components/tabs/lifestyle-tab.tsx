"use client"

import { useMemo, useState, useEffect } from "react"
import { useStatement } from "@/lib/store"
import { formatCompact, formatCurrency } from "@/lib/analytics"
import { calculatePolishTaxes } from "@/lib/taxes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Landmark, Building, ShoppingBag, TrendingUp, AlertTriangle, Play, FastForward, History, Search, CalendarDays, Wallet, Banknote, ShieldAlert, BadgeCent, TrendingDown, ArrowRight, ArrowDownRight, ArrowUpRight } from "lucide-react"
import type { CatalogItem } from "@/lib/types"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts"
import { KpiCard } from "@/components/kpi-card"
import { cn } from "@/lib/utils"

export function LifestyleTab() {
  const { statement, sourceTrades, lifestyleConfig, updateLifestyleConfig } = useStatement()
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("All")
  
  useEffect(() => {
    Promise.all([
      fetch('/catalog.json').then(r => r.json()).catch(() => []),
      fetch('/api/market/real-estate').then(r => r.json()).catch(() => []),
      fetch('/api/market/rentals').then(r => r.json()).catch(() => []),
      fetch('/api/market/bonds').then(r => r.json()).catch(() => [])
    ]).then(([staticItems, reItems, rentItems, bondItems]) => {
      setCatalog([...staticItems, ...reItems, ...rentItems, ...bondItems])
    })
  }, [])

  if (!statement) return null

  const currency = statement.account.currency
  const ts = lifestyleConfig.tycoonState

  // --- Start Game ---
  const netTradingProfit = sourceTrades.reduce((s, t) => s + t.profit + t.commission + t.swap, 0)
  const exactBalance = statement.initialDeposit 
    + statement.balanceEntries.reduce((s, b) => s + b.amount, 0) 
    + netTradingProfit

  const exitTax = netTradingProfit > 0 ? netTradingProfit * 0.19 : 0
  const startingLiquidCash = exactBalance - exitTax

  const startGame = () => {
    updateLifestyleConfig({
      ...lifestyleConfig,
      tycoonState: {
        isStarted: true,
        month: 1,
        year: 1,
        liquidCash: startingLiquidCash,
        history: [{ monthIndex: 0, liquidCash: startingLiquidCash, netWorth: startingLiquidCash }]
      }
    })
  }

  const resetGame = () => {
    if (!confirm("Reset FIRE Tycoon game? You will lose all purchased assets and subscriptions.")) return
    updateLifestyleConfig({
      ...lifestyleConfig,
      ownedItems: [],
      realEstate: [],
      bonds: [],
      tycoonState: undefined
    })
  }

  // --- Game State Helpers ---
  const realEstate = lifestyleConfig.realEstate || []
  const bonds = lifestyleConfig.bonds || []
  const ownedItems = lifestyleConfig.ownedItems || []

  const realEstateValue = realEstate.reduce((sum, r) => sum + r.purchasePrice, 0)
  const bondValue = bonds.reduce((sum, b) => sum + b.principal, 0)
  const luxuryValue = ownedItems.reduce((sum, i) => sum + (i.type === "subscription" ? 0 : i.price), 0)

  const currentLiquidCash = ts ? ts.liquidCash : exactBalance
  const currentNetWorth = currentLiquidCash + realEstateValue + bondValue + luxuryValue

  // Physics Helpers
  const grossMonthlyRentalIncome = realEstate.reduce((sum, r) => sum + (r.monthlyRent || 0), 0)
  const grossMonthlyBondYields = bonds.reduce((sum, b) => sum + ((b.principal * (b.annualYield / 100)) / 12), 0)
  const taxOutputs = calculatePolishTaxes({ tradingProfit: 0, rentalIncome: grossMonthlyRentalIncome, bondYields: grossMonthlyBondYields })
  const luxuryMaintenance = ownedItems.reduce((sum, i) => sum + i.monthlyMaintenance, 0)
  const realEstateMaintenance = realEstate.reduce((sum, r) => sum + r.monthlyMaintenance, 0)
  const totalExpenses = luxuryMaintenance + realEstateMaintenance
  const netCashflow = taxOutputs.netIncome - totalExpenses

  const advanceMonth = () => {
    if (!ts) return
    let newCash = ts.liquidCash + netCashflow
    
    // Auto-Invest (DCA) into bonds/indexes if netCashflow is positive
    let updatedBonds = [...bonds]
    if (netCashflow > 0 && updatedBonds.length > 0) {
      const totalInvestPct = updatedBonds.reduce((s, b) => s + (b.autoInvestPct || 0), 0)
      const scale = totalInvestPct > 100 ? 100 / totalInvestPct : 1

      updatedBonds = updatedBonds.map(b => {
        if (!b.autoInvestPct) return b
        const pct = b.autoInvestPct * scale
        const investAmount = netCashflow * (pct / 100)
        newCash -= investAmount
        return { ...b, principal: b.principal + investAmount }
      })
    }

    let newMonth = ts.month + 1
    let newYear = ts.year
    if (newMonth > 12) {
      newMonth = 1
      newYear += 1
    }
    const monthIndex = ts.history.length
    
    const newBondValue = updatedBonds.reduce((sum, b) => sum + b.principal, 0)
    const newNetWorth = newCash + realEstateValue + newBondValue + luxuryValue

    updateLifestyleConfig({
      ...lifestyleConfig,
      bonds: updatedBonds,
      tycoonState: {
        ...ts,
        month: newMonth,
        year: newYear,
        liquidCash: newCash,
        history: [...ts.history, { monthIndex, liquidCash: newCash, netWorth: newNetWorth }]
      }
    })
  }

  const buyCatalogItem = (item: CatalogItem, qty: number = 1) => {
    if (!ts) return alert("Start the simulation first!")
    const totalPrice = item.price * qty
    if (ts.liquidCash < totalPrice) return alert("Not enough liquid cash!")

    const nextCash = ts.liquidCash - totalPrice
    const nextTs = { ...ts, liquidCash: nextCash }

    if (item.category === "Real Estate") {
      updateLifestyleConfig({
        ...lifestyleConfig,
        tycoonState: nextTs,
        realEstate: [...realEstate, {
          id: item.id + "_" + Date.now(),
          name: qty > 1 ? `${qty}x ${item.name}` : item.name,
          purchasePrice: totalPrice,
          monthlyRent: (item.monthlyRent || 0) * qty,
          monthlyMaintenance: (item.monthlyMaintenance || 0) * qty
        }]
      })
    } else if (item.category === "Bonds" || item.category === "Index Funds") {
      updateLifestyleConfig({
        ...lifestyleConfig,
        tycoonState: nextTs,
        bonds: [...bonds, {
          id: item.id + "_" + Date.now(),
          name: qty > 1 ? `${qty}x ${item.name}` : item.name,
          principal: totalPrice,
          annualYield: item.annualYield || 0
        }]
      })
    } else {
      updateLifestyleConfig({
        ...lifestyleConfig,
        tycoonState: nextTs,
        ownedItems: [...ownedItems, {
          ...item,
          id: item.id + "_" + Date.now(),
          name: qty > 1 ? `${qty}x ${item.name}` : item.name,
          price: totalPrice,
          monthlyMaintenance: (item.monthlyMaintenance || 0) * qty
        }]
      })
    }
  }

  const liquidateRealEstate = (index: number) => {
    if (!ts || !confirm("Liquidate this property? (3% transaction fee applied)")) return
    const asset = realEstate[index]
    const recovery = asset.purchasePrice * 0.97
    const nextRE = [...realEstate]
    nextRE.splice(index, 1)
    updateLifestyleConfig({ ...lifestyleConfig, tycoonState: { ...ts, liquidCash: ts.liquidCash + recovery }, realEstate: nextRE })
  }

  const updateBondDCA = (index: number, pct: number) => {
    const nextBonds = [...bonds]
    nextBonds[index] = { ...nextBonds[index], autoInvestPct: Math.min(100, Math.max(0, pct)) }
    updateLifestyleConfig({ ...lifestyleConfig, bonds: nextBonds })
  }

  const liquidateBond = (index: number) => {
    if (!ts || !confirm("Liquidate this security? (No fee)")) return
    const asset = bonds[index]
    const nextBonds = [...bonds]
    nextBonds.splice(index, 1)
    updateLifestyleConfig({ ...lifestyleConfig, tycoonState: { ...ts, liquidCash: ts.liquidCash + asset.principal }, bonds: nextBonds })
  }

  const sellCatalogItem = (index: number) => {
    if (!ts) return
    const asset = ownedItems[index]
    if (asset.type === "subscription") {
      if (!confirm("Cancel this subscription?")) return
      const nextItems = [...ownedItems]
      nextItems.splice(index, 1)
      updateLifestyleConfig({ ...lifestyleConfig, ownedItems: nextItems })
    } else {
      if (!confirm("Sell this item? (20% depreciation hit)")) return
      const recovery = asset.price * 0.8
      const nextItems = [...ownedItems]
      nextItems.splice(index, 1)
      updateLifestyleConfig({ ...lifestyleConfig, tycoonState: { ...ts, liquidCash: ts.liquidCash + recovery }, ownedItems: nextItems })
    }
  }

  if (!ts?.isStarted) {
    return (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card p-6 md:p-12 flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/30">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Final Settlement & Exit Tax</h1>
          <p className="mt-4 max-w-lg text-muted-foreground">
            You are cashing out your broker account to start a FIRE lifestyle. The Urząd Skarbowy (Tax Office) instantly collects 19% capital gains (Podatek Belki) on your realized net profits.
          </p>
          
          <div className="mt-8 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <KpiCard label="Final Balance" value={formatCompact(exactBalance, currency)} icon={Landmark} tone="default" />
            <KpiCard label="Net Profit" value={formatCompact(netTradingProfit, currency)} icon={TrendingUp} tone={netTradingProfit >= 0 ? "profit" : "loss"} />
            <KpiCard label="Exit Tax (19%)" value={formatCompact(-exitTax, currency)} icon={ShieldAlert} tone="loss" />
            <KpiCard label="Liquid Cash" value={formatCompact(startingLiquidCash, currency)} icon={Wallet} tone="accent" />
          </div>

          <div className="mt-10">
            <Button size="lg" onClick={startGame} className="gap-2">
              <Play className="h-4 w-4 fill-current" /> Pay Tax & Start Tycoon
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const isBankrupt = ts.liquidCash < 0

  const categories = ["All", ...new Set(catalog.map(c => c.category))]
  const filteredCatalog = catalog.filter(c => {
    if (selectedCategory !== "All" && c.category !== selectedCategory) return false
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6">
      
      {/* 1. Header KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Time Elapsed" value={`Year ${ts.year}`} hint={`Month ${ts.month}`} icon={CalendarDays} tone="default" />
        <KpiCard label="Liquid Cash" value={formatCompact(ts.liquidCash, currency)} hint={isBankrupt ? "BANKRUPT!" : "Available"} icon={Wallet} tone={isBankrupt ? "loss" : "accent"} />
        <KpiCard label="Total Net Worth" value={formatCompact(currentNetWorth, currency)} hint="Cash + Assets" icon={Landmark} tone="profit" />
        <KpiCard label="Gross Passive" value={formatCompact(grossMonthlyRentalIncome + grossMonthlyBondYields, currency)} hint="Yields / Mo" icon={TrendingUp} tone="profit" />
        <KpiCard label="Net Cashflow" value={formatCompact(netCashflow, currency)} hint="Delta / Mo" icon={Banknote} tone={netCashflow >= 0 ? "profit" : "loss"} />
        
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 items-center justify-center">
           <Button size="sm" className="w-full gap-2 font-bold bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30" onClick={advanceMonth} disabled={isBankrupt}>
             Next Mo <FastForward className="h-4 w-4 fill-current" />
           </Button>
           <Button variant="ghost" size="sm" className="w-full text-[10px] uppercase text-muted-foreground h-6" onClick={resetGame}>Reset Game</Button>
        </div>
      </div>

      {isBankrupt && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center text-destructive">
          <AlertTriangle className="mb-2 h-8 w-8" />
          <h2 className="text-xl font-bold">BANKRUPTCY!</h2>
          <p className="mt-1 text-sm opacity-90">You ran out of liquid cash. Sell assets to get back in the green, or reset.</p>
        </div>
      )}

      {/* 2. Main Chart */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-medium">Net Worth & Liquidity Over Time</div>
            <div className="text-xs text-muted-foreground">Historical progression through Tycoon simulation</div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Net Worth</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Liquid Cash</span>
          </div>
        </div>
        <div className="h-72 w-full p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ts.history} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorNw" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="monthIndex" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `Mo ${v}`} />
              <YAxis stroke="var(--muted-foreground)" tickFormatter={(v) => formatCompact(v, currency)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
              <Tooltip content={<GenericTooltip currency={currency} />} cursor={{ stroke: "var(--secondary)", strokeWidth: 1, opacity: 0.4 }} />
              <Area type="monotone" dataKey="netWorth" name="Net Worth" stroke="var(--primary)" fillOpacity={1} fill="url(#colorNw)" strokeWidth={2} />
              <Area type="monotone" dataKey="liquidCash" name="Liquid Cash" stroke="#10b981" fillOpacity={1} fill="url(#colorCash)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Cashflow Statement & Portfolio Splits */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Cashflow Split */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Monthly Cashflow Statement</div>
            <div className="text-xs text-muted-foreground">Incomes vs Taxes & Expenses</div>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <SplitRow color="bg-emerald-500" label="Rental Yields" value={formatCurrency(grossMonthlyRentalIncome, currency)} />
              <SplitRow color="bg-emerald-500" label="Securities Yields (Bonds/Indexes)" value={formatCurrency(grossMonthlyBondYields, currency)} />
              <SplitRow color="bg-destructive" label="Taxes (Belka & Ryczałt)" value={formatCurrency(-(taxOutputs.bondTax + taxOutputs.rentalTax), currency)} />
              <SplitRow color="bg-destructive" label="Lifestyle Subscriptions" value={formatCurrency(-luxuryMaintenance, currency)} />
              <SplitRow color="bg-destructive" label="Real Estate Maintenance" value={formatCurrency(-realEstateMaintenance, currency)} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-3">
              <span className="font-semibold text-sm">Net Monthly Cashflow</span>
              <span className={cn("font-mono tnum font-bold", netCashflow >= 0 ? "text-primary" : "text-destructive")}>
                {netCashflow >= 0 ? "+" : ""}{formatCurrency(netCashflow, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Portfolio List */}
        <div className="overflow-hidden rounded-xl border border-border bg-card xl:col-span-2 flex flex-col">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">My Portfolio Inventory</div>
            <div className="text-xs text-muted-foreground">Assets & Active Subscriptions</div>
          </div>
          <div className="max-h-[300px] overflow-y-auto thin-scroll flex-1">
            {ownedItems.length === 0 && realEstate.length === 0 && bonds.length === 0 ? (
               <div className="flex h-full items-center justify-center text-sm text-muted-foreground py-10">Portfolio is empty. Buy assets from the catalog.</div>
            ) : (
              <ul className="divide-y divide-border">
                {ownedItems.map((item, i) => (
                  <li key={`subs_${i}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0">{item.image}</span>
                      <div className="flex flex-col">
                        <span className="truncate font-medium">{item.name}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">{item.type === "subscription" ? "Subscription" : "Asset"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-mono text-xs text-destructive text-right">-{formatCompact(item.monthlyMaintenance, currency)}/mo</span>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] text-destructive px-2" onClick={() => sellCatalogItem(i)}>{item.type === "subscription" ? "Cancel" : "Sell"}</Button>
                    </div>
                  </li>
                ))}
                {realEstate.map((re, i) => (
                  <li key={`re_${i}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/30">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0">🏢</span>
                      <div className="flex flex-col">
                        <span className="truncate font-medium">{re.name}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">Real Estate</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-xs text-emerald-500">+{formatCompact(re.monthlyRent, currency)}/mo</span>
                        <span className="font-mono text-[10px] text-destructive">-{formatCompact(re.monthlyMaintenance, currency)}</span>
                      </div>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] text-destructive px-2" onClick={() => liquidateRealEstate(i)}>Liquidate</Button>
                    </div>
                  </li>
                ))}
                {bonds.map((bond, i) => (
                  <li key={`b_${i}`} className="flex flex-col md:flex-row md:items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0">{bond.name.includes('Index') ? '📈' : '📜'}</span>
                      <div className="flex flex-col">
                        <span className="truncate font-medium">{bond.name}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">Security • {formatCompact(bond.principal, currency)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end w-full md:w-auto">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase text-muted-foreground mr-1 hidden sm:block">DCA % of Net Cashflow:</span>
                        <Input 
                          type="number" 
                          min={0} 
                          max={100}
                          value={bond.autoInvestPct || 0}
                          onChange={(e) => updateBondDCA(i, parseInt(e.target.value) || 0)}
                          className="h-6 w-14 text-xs px-1 text-center"
                          title="Auto-invest this % of your monthly net cashflow into this security"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      <span className="font-mono text-xs text-emerald-500 text-right min-w-[70px]">+{bond.annualYield}% Yld</span>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] text-destructive px-2" onClick={() => liquidateBond(i)}>Liquidate</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 4. Live Wealth Catalog */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
         <div className="border-b border-border px-4 py-3 flex justify-between items-center bg-muted/10">
            <div>
              <div className="text-sm font-medium">Live Wealth Catalog</div>
              <div className="text-xs text-muted-foreground">Invest and build your lifestyle</div>
            </div>
            <div className="relative w-48 hidden md:block">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search..." className="h-8 pl-8 text-xs bg-background" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
         </div>
         <div className="flex flex-col md:flex-row border-t border-border">
            
            {/* Sidebar Categories */}
            <div className="w-full md:w-48 shrink-0 border-r border-border p-2 space-y-0.5 bg-muted/5">
               {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-xs rounded-md transition-all font-medium",
                      selectedCategory === cat ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {cat}
                  </button>
               ))}
            </div>

            {/* Catalog Grid */}
            <div className="flex-1 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto thin-scroll">
               {filteredCatalog.map(item => (
                 <CatalogCard 
                   key={item.id} 
                   item={item} 
                   currency={currency} 
                   liquidCash={ts.liquidCash} 
                   isBankrupt={isBankrupt} 
                   onBuy={(qty) => buyCatalogItem(item, qty)} 
                 />
               ))}
               {filteredCatalog.length === 0 && (
                 <div className="col-span-full py-10 text-center text-sm text-muted-foreground">No items match your search.</div>
               )}
            </div>

         </div>
      </div>
    </div>
  )
}

function SplitRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background/60 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span className={cn("h-2 w-2 rounded-full", color)} />
        <span>{label}</span>
      </div>
      <div className="font-mono text-sm tnum font-medium text-foreground">
        {value}
      </div>
    </div>
  )
}

function GenericTooltip({ active, payload, label, currency = "USD" }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label && <div className="font-mono text-muted-foreground mb-1">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="mt-1 flex items-center gap-3 font-mono tnum">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="text-foreground">
            {typeof p.value === "number" ? formatCurrency(p.value, currency) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function CatalogCard({ item, currency, liquidCash, isBankrupt, onBuy }: { item: CatalogItem, currency: string, liquidCash: number, isBankrupt: boolean, onBuy: (qty: number) => void }) {
  const [qty, setQty] = useState<number>(1)
  
  const isSub = item.type === "subscription"
  const totalPrice = item.price * qty
  const canAfford = liquidCash >= totalPrice

  const handleBuy = () => {
    if (qty < 1 || isNaN(qty)) return
    onBuy(qty)
    setQty(1)
  }

  return (
    <div className="group rounded-lg border border-border bg-background p-3 hover:border-primary/40 transition-colors flex flex-col">
      <div className="flex justify-between items-start mb-2">
        <span className="text-2xl group-hover:scale-110 transition-transform">{item.image}</span>
        <span className={cn("text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded", isSub ? "bg-blue-500/10 text-blue-500" : "bg-muted text-muted-foreground")}>
          {item.category}
        </span>
      </div>
      <h3 className="font-semibold text-sm mb-1 leading-tight line-clamp-2 min-h-[2.5rem]">{item.name}</h3>
      <div className="mt-auto pt-2 space-y-1">
        <div className="font-mono text-sm font-semibold text-primary">{isSub ? "$0 up front" : formatCurrency(item.price, currency)}</div>
        
        {item.monthlyMaintenance > 0 && <div className="text-[10px] text-destructive font-mono flex items-center"><ArrowDownRight className="w-3 h-3 mr-0.5"/>{formatCompact(item.monthlyMaintenance, currency)} / mo</div>}
        {item.monthlyRent && <div className="text-[10px] text-emerald-500 font-mono flex items-center"><ArrowUpRight className="w-3 h-3 mr-0.5"/>{formatCompact(item.monthlyRent, currency)} / mo</div>}
        {item.annualYield && <div className="text-[10px] text-emerald-500 font-mono flex items-center"><ArrowUpRight className="w-3 h-3 mr-0.5"/>{item.annualYield}% annual</div>}
      </div>
      <div className="flex gap-2 mt-3 items-center">
        <Input 
          type="number" 
          min={1} 
          value={qty} 
          onChange={(e) => setQty(parseInt(e.target.value) || 1)}
          className="h-7 w-16 text-xs px-2"
        />
        <Button 
          size="sm"
          className="flex-1 h-7 text-xs shadow-none" 
          variant={canAfford ? (isSub ? "outline" : "default") : "secondary"}
          disabled={!canAfford || isBankrupt}
          onClick={handleBuy}
        >
          {isSub ? "Subscribe" : (canAfford ? "Buy" : "Can't Afford")}
        </Button>
      </div>
    </div>
  )
}
