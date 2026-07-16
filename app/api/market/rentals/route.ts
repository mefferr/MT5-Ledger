import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export async function GET() {
  try {
    const res = await fetch('https://gratka.pl/nieruchomosci/mieszkania/warszawa/wynajem', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'
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
        const rentPln = parseInt(priceClean)
        
        if (!isNaN(rentPln) && rentPln > 500) {
          // Convert to roughly USD
          const rentUsd = Math.round(rentPln / 4)
          
          items.push({
            id: `scraped_rent_${i}`,
            category: "Real Estate (Rent)",
            type: "subscription",
            name: title.substring(0, 50) + (title.length > 50 ? "..." : ""),
            price: 0, // No upfront purchase price to rent
            monthlyMaintenance: rentUsd, // This is the rent
            image: "🔑"
          })
        }
      }
    })
    
    // Fallback
    if (items.length === 0) {
      items.push(
        { id: "fallback_rent_1", category: "Real Estate (Rent)", type: "subscription", name: "Złota 44 Penthouse Rental (Live Fallback)", price: 0, monthlyMaintenance: 8000, image: "🔑" },
        { id: "fallback_rent_2", category: "Real Estate (Rent)", type: "subscription", name: "Cosmopolitan Apartment Rental (Live Fallback)", price: 0, monthlyMaintenance: 4000, image: "🔑" }
      )
    }

    return NextResponse.json(items)
  } catch (error) {
    console.error("Rental Scrape Error", error)
    return NextResponse.json([{ id: "err_rent_1", category: "Real Estate (Rent)", type: "subscription", name: "Scraper Error Rental", price: 0, monthlyMaintenance: 2000, image: "🔑" }])
  }
}
