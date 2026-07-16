import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export async function GET() {
  try {
    const items: any[] = []
    
    // 1. Scrape Global Bonds (10Y Government Yields)
    try {
      const resBonds = await fetch('https://tradingeconomics.com/bonds', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        next: { revalidate: 3600 }
      })
      const htmlBonds = await resBonds.text()
      const $b = cheerio.load(htmlBonds)
      
      $b('table.table-hover tr').each((i, el) => {
        if (items.length >= 15 || i === 0) return // Get top 15 bonds
        
        const cols = $b(el).find('td')
        if (cols.length >= 4) {
          const country = $b(cols[1]).find('b').text().trim() || $b(cols[1]).text().trim()
          const yieldText = $b(cols[2]).text().trim()
          
          if (country && yieldText) {
            const yieldClean = parseFloat(yieldText.replace(',', '.'))
            if (!isNaN(yieldClean)) {
              items.push({
                id: `bond_${i}`,
                category: "Bonds",
                name: `${country} 10-Year Govt Bond`,
                price: 10000, // Standard minimum investment
                annualYield: yieldClean,
                monthlyMaintenance: 0,
                image: "📜"
              })
            }
          }
        }
      })
    } catch (e) {
      console.error("Bond Scrape Error", e)
    }

    // 2. Scrape Global Stock Indexes (1Y Performance as Yield)
    try {
      const resStocks = await fetch('https://tradingeconomics.com/stocks', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        next: { revalidate: 3600 }
      })
      const htmlStocks = await resStocks.text()
      const $s = cheerio.load(htmlStocks)
      
      $s('table.table-hover tr').each((i, el) => {
        // Offset ID to prevent collision
        if (items.length >= 35 || i === 0) return // Get top 20 indexes
        
        const cols = $s(el).find('td')
        if (cols.length >= 8) {
          const name = $s(cols[1]).find('b').text().trim() || $s(cols[1]).text().trim()
          const perfText = $s(cols[7]).text().trim() // 1Y performance column
          
          if (name && perfText && perfText.includes('%')) {
            const perfClean = parseFloat(perfText.replace('%', '').replace(',', '.'))
            if (!isNaN(perfClean)) {
              // Map some common names to be more readable
              let indexName = name
              if (name === "US500") indexName = "S&P 500 Index Fund"
              else if (name === "US30") indexName = "Dow Jones Index Fund"
              else if (name === "US100") indexName = "Nasdaq 100 Index Fund"
              else if (name === "JP225") indexName = "Nikkei 225 Index Fund"
              else if (name === "GB100") indexName = "FTSE 100 Index Fund"
              else if (name === "DE40") indexName = "DAX 40 Index Fund"
              else indexName = `${name} Index Fund`

              items.push({
                id: `index_${i}`,
                category: "Index Funds",
                name: indexName,
                price: 5000, // Standard minimum investment
                annualYield: perfClean, // Historical 1Y return
                monthlyMaintenance: 0,
                image: "📈"
              })
            }
          }
        }
      })
    } catch (e) {
      console.error("Stock Scrape Error", e)
    }
    
    // Fallbacks just in case the scrape fails entirely
    if (items.length === 0) {
      items.push(
        { id: "fallback_bond_1", category: "Bonds", name: "US 10-Year Treasury (Live Fallback)", price: 10000, annualYield: 4.5, monthlyMaintenance: 0, image: "📜" },
        { id: "fallback_bond_2", category: "Bonds", name: "Polish EDO 10-Year (Live Fallback)", price: 10000, annualYield: 6.5, monthlyMaintenance: 0, image: "📜" },
        { id: "fallback_idx_1", category: "Index Funds", name: "S&P 500 ETF (Live Fallback)", price: 5000, annualYield: 10.5, monthlyMaintenance: 0, image: "📈" }
      )
    }

    return NextResponse.json(items)
  } catch (error) {
    console.error("Market API Error", error)
    return NextResponse.json([{ id: "err_1", category: "Bonds", name: "US 10-Year Treasury (Err)", price: 10000, annualYield: 4.5, monthlyMaintenance: 0, image: "📜" }])
  }
}
