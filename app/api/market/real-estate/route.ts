import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export async function GET() {
  try {
    const res = await fetch('https://gratka.pl/nieruchomosci/mieszkania/warszawa', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    })
    const html = await res.text()
    const $ = cheerio.load(html)
    
    const items: any[] = []
    
    $('article').each((i, el) => {
      if (items.length >= 8) return
      
      const title = $(el).find('h2, h3').first().text().trim() || $(el).find('.teaserUnified__title').text().trim()
      const priceText = $(el).find('.teaserUnified__price').text() || $(el).find('[class*="price"]').first().text().trim()
      
      if (title && priceText && priceText.includes('zł')) {
        const priceClean = priceText.replace(/[^0-9]/g, '')
        const pricePln = parseInt(priceClean)
        
        if (!isNaN(pricePln) && pricePln > 10000) {
          // Convert to roughly USD (divide by 4) for the app consistency
          const priceUsd = Math.round(pricePln / 4)
          
          // Estimate rent: ~4% annual gross yield in Warsaw
          const monthlyRent = Math.round((priceUsd * 0.04) / 12)
          
          items.push({
            id: `scraped_re_${i}`,
            category: "Real Estate",
            name: title.substring(0, 50) + (title.length > 50 ? "..." : ""),
            price: priceUsd,
            monthlyMaintenance: Math.round(priceUsd * 0.001),
            monthlyRent: monthlyRent,
            image: "🏢"
          })
        }
      }
    })
    
    // Fallback just in case gratka blocks the request or changes DOM
    if (items.length === 0) {
      items.push(
        { id: "fallback_re_1", category: "Real Estate", name: "Złota 44 Penthouse, Śródmieście (Live Fallback)", price: 2500000, monthlyMaintenance: 2000, monthlyRent: 8000, image: "🏙️" },
        { id: "fallback_re_2", category: "Real Estate", name: "Cosmopolitan Apartment (Live Fallback)", price: 1200000, monthlyMaintenance: 1000, monthlyRent: 4000, image: "🏙️" }
      )
    }

    return NextResponse.json(items)
  } catch (error) {
    console.error("RE Scrape Error", error)
    return NextResponse.json([{ id: "err_1", category: "Real Estate", name: "Scraper Blocked - Warsaw Apt", price: 500000, monthlyMaintenance: 500, monthlyRent: 2000, image: "🏙️" }])
  }
}
