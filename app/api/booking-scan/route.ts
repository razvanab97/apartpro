import { NextRequest, NextResponse } from 'next/server'

// Parseaza pretul din text Romanian (ex: "182 lei", "182", "1.234 lei")
function parsePrice(text: string): number {
  const cleaned = text.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  return parseFloat(cleaned) || 0
}

// Extrage proprietatile din textul paginii Booking
function extractProperties(pageText: string): Array<{ rank: number; name: string; price: number; priceText: string }> {
  const results: Array<{ rank: number; name: string; price: number; priceText: string }> = []

  // Pattern pentru a extrage blocuri de proprietati
  // Booking.com in romana afiseaza: Nume proprietate ... X lei ... Include taxe
  const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean)

  let rank = 0
  let i = 0

  while (i < lines.length && results.length < 5) {
    const line = lines[i]

    // Detecteaza pretul: linie care contine "lei" si un numar
    const priceMatch = line.match(/^(\d[\d.,]*)\s*lei$/) ||
                       line.match(/Preț (?:actual )?(\d[\d.,]*)\s*lei/) ||
                       line.match(/^(\d[\d.,]+)\s*lei\s*$/)

    if (priceMatch) {
      const price = parsePrice(priceMatch[1])
      if (price > 50 && price < 5000) {
        // Cauta numele proprietatii in liniile anterioare (inapoi pana la 15 linii)
        let name = ''
        for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
          const candidate = lines[j]
          // Numele e de obicei o linie mai lunga, nu "Lei", nu numar, nu "Iaşi", nu "Arată pe hartă"
          if (
            candidate.length > 5 &&
            candidate.length < 120 &&
            !candidate.match(/^\d/) &&
            !candidate.match(/^(Iaşi|Iași|Arată|Include|Anulare|Rezerv|Camere|Preț|Nou|Vizib|Aceast|Proprietate|Studio|Apart|Cameră|Dormitor|1 noapte|Se deschide|Locaţie|Superb|Fabulos|Bine|Excep|Plăcut|Scor)/i) &&
            !candidate.match(/^\d+\s*(evaluări|stele)/) &&
            !candidate.includes('km de centru') &&
            !candidate.includes('m de centru') &&
            !candidate.includes('paturi') &&
            !candidate.includes('baie') &&
            !candidate.includes('bucătărie')
          ) {
            name = candidate
            break
          }
        }

        if (name && !results.find(r => r.name === name)) {
          rank++
          const priceText = `${price} lei`
          results.push({ rank, name, price, priceText })
        }
      }
    }
    i++
  }

  return results.sort((a, b) => a.price - b.price).map((r, idx) => ({ ...r, rank: idx + 1 }))
}

export async function POST(req: NextRequest) {
  try {
    const { checkin, checkout, bookingUrl } = await req.json()

    if (!checkin || !checkout) {
      return NextResponse.json({ error: 'checkin și checkout sunt obligatorii' }, { status: 400 })
    }

    // Apelam Claude API cu web search + browser tool pentru a face scraping
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'computer-use-2024-10-22',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        tools: [
          {
            type: 'computer_20241022',
            name: 'computer',
            display_width_px: 1280,
            display_height_px: 800,
          }
        ],
        messages: [
          {
            role: 'user',
            content: `Navighează la acest URL pe Booking.com și extrage primele 5 proprietăți listate (sortate după preț):
URL: ${bookingUrl}

Instrucțiuni:
1. Deschide URL-ul
2. Așteaptă să se încarce complet
3. Dacă apare popup cookie, închide-l
4. Extrage primele 5 proprietăți cu numele exact și prețul per noapte în lei
5. Returnează DOAR acest JSON (fără alt text):
[{"rank":1,"name":"Nume proprietate","priceText":"182 lei","price":182},{"rank":2,...}]`
          }
        ]
      })
    })

    // Daca Claude API nu e disponibil server-side, folosim web fetch direct
    if (!claudeResponse.ok) {
      // Fallback: fetch direct pagina Booking
      const bookingResponse = await fetch(bookingUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ro-RO,ro;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      })

      if (!bookingResponse.ok) {
        return NextResponse.json({ error: `Booking.com a returnat eroare: ${bookingResponse.status}` }, { status: 502 })
      }

      const html = await bookingResponse.text()

      // Extrage datele din HTML cu regex
      const propertyResults: Array<{ rank: number; name: string; price: number; priceText: string }> = []

      // Pattern pentru proprietati in HTML-ul Booking
      // Cauta data-testid="property-card" sau structuri similare
      const propertyBlocks = html.match(/data-testid="property-card"[\s\S]*?(?=data-testid="property-card"|<\/main>)/g) || []

      if (propertyBlocks.length > 0) {
        let rank = 0
        for (const block of propertyBlocks.slice(0, 8)) {
          // Extrage numele
          const nameMatch = block.match(/data-testid="title"[^>]*>([^<]+)</) ||
                           block.match(/class="[^"]*pp-title[^"]*"[^>]*>([^<]+)</) ||
                           block.match(/<span[^>]*class="[^"]*fcab3ed991[^"]*"[^>]*>([^<]+)<\/span>/)

          // Extrage pretul
          const priceMatch = block.match(/data-testid="price-and-discounted-price"[^>]*>[\s\S]*?(\d[\d.,]+)\s*lei/) ||
                            block.match(/class="[^"]*pricecolor[^"]*"[^>]*>[\s\S]*?(\d[\d.,]+)/) ||
                            block.match(/(\d[\d.,]+)\s*lei[\s\S]*?Include taxe/)

          if (nameMatch && priceMatch) {
            const name = nameMatch[1].replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim()
            const price = parsePrice(priceMatch[1])
            if (name && price > 50 && price < 5000 && !propertyResults.find(r => r.name === name)) {
              rank++
              propertyResults.push({ rank, name, price, priceText: `${price} lei` })
              if (propertyResults.length >= 5) break
            }
          }
        }
      }

      // Daca nu am gasit cu blocuri, parsam text
      if (propertyResults.length < 3) {
        // Strip HTML
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, '\n')
          .replace(/&amp;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .replace(/&#\d+;/g, '')
          .replace(/\n{3,}/g, '\n\n')

        const textResults = extractProperties(text)
        if (textResults.length > propertyResults.length) {
          return NextResponse.json({ results: textResults.slice(0, 5) })
        }
      }

      return NextResponse.json({ results: propertyResults.slice(0, 5) })
    }

    // Proceseaza raspunsul Claude
    const claudeData = await claudeResponse.json()
    const textContent = claudeData.content?.find((c: any) => c.type === 'text')?.text || ''

    try {
      const jsonStart = textContent.indexOf('[')
      const jsonEnd = textContent.lastIndexOf(']')
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const results = JSON.parse(textContent.slice(jsonStart, jsonEnd + 1))
        return NextResponse.json({ results: results.slice(0, 5) })
      }
    } catch {}

    return NextResponse.json({ error: 'Nu s-au putut parsa rezultatele' }, { status: 500 })

  } catch (err: any) {
    console.error('[booking-scan]', err)
    return NextResponse.json({ error: err.message || 'Eroare internă' }, { status: 500 })
  }
}
