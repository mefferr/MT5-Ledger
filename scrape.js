const cheerio = require('cheerio');
fetch('https://tradingeconomics.com/stocks', {headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}})
  .then(r => r.text())
  .then(html => { 
    const $ = cheerio.load(html); 
    const stocks = []; 
    $('table.table-hover tr').each((i, el) => { 
      const cols = $(el).find('td'); 
      if (cols.length >= 6) { 
        const name = $(cols[1]).find('b').text().trim() || $(cols[1]).text().trim(); 
        const yieldText = $(cols[7]).text().trim(); // Let's check which column is 1Y 
        stocks.push({name, yieldText}); 
      } 
    }); 
    console.log(stocks.slice(0, 10)); 
  });
