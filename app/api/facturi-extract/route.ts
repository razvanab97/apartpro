import { NextRequest, NextResponse } from 'next/server'

const CLAUDE_KEY = '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'

const FURNIZORI: Record<string, string[]> = {
  'E.ON Curent':    ['e.on','eon curent','energie electrica','electricitate','standard electricity','curent electric'],
  'E.ON Gaz':       ['gaz natural','consum gaz','eon gaz','mc gaz','standard gas','gaze naturale','eon energie'],
  'Urbica':         ['urbica','apa canal','apa rece','apa calda','termoficare urbica'],
  'TermoService':   ['termoservice','termoficare','caldura','gigacalorie','gcal'],
  'Salubris':       ['salubris','salubritate','gunoi','deseuri','colectare'],
  'Orange':         ['orange','abonament orange'],
  'Vodafone':       ['vodafone','abonament vodafone'],
  'Royal':          ['royal','royal imob','royal property'],
  'Internet':       ['internet','fibra','broadband','rds','digi','telekom'],
  'Asociatie':      ['asociatie','fond rulment','intretinere','cheltuieli comune'],
  'Alta':           [],
}

export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType, filename } = await req.json()
    if (!base64Data) return NextResponse.json({ error: 'No file data' }, { status: 400 })

    const isImage = mimeType?.startsWith('image/')
    const mediaType = isImage ? mimeType : 'application/pdf'

    const prompt = `Esti un expert in citirea facturilor romanesti. Analizeaza aceasta factura si extrage EXACT:
1. Furnizor: numele companiei emitente
2. Suma CURENTA de plata - DOAR factura curenta, fara restante/solduri anterioare. Cauta campul 'Total valoare factura curenta' sau 'Suma factura curenta'. NU folosi 'Sold de plata' sau 'Total de achitat' care include restante.
3. Data scadentei (termenul limita de plata, format YYYY-MM-DD)
4. Perioada facturata
5. Numarul facturii
6. Tipul serviciului (gaz natural, curent electric, apa, termoficare, salubritate, telefonie, internet, asociatie, altele)
7. ADRESA LOCULUI DE CONSUM - strada, numarul, blocul, scara, apartamentul (NU adresa sediului companiei)
8. Numele titularului contractului

Raspunde DOAR cu JSON valid, fara explicatii, fara markdown:
{
  "furnizor": "numele companiei",
  "suma_totala": 123.45,
  "moneda": "RON",
  "data_scadenta": "YYYY-MM-DD sau null",
  "perioada": "descriere perioada",
  "nr_factura": "numarul facturii",
  "tip_serviciu": "categoria",
  "adresa_consum": "strada si numarul complet al locului de consum",
  "adresa_titular": "adresa titularului daca e diferita",
  "titular": "numele titularului",
  "detalii": "orice info relevant"
}`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: isImage ? 'image' : 'document',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })

    const claudeData = await claudeRes.json()

    if (claudeData.error) {
      console.error('Claude API error:', claudeData.error)
      return NextResponse.json({ error: claudeData.error.message }, { status: 500 })
    }

    const raw = claudeData?.content?.[0]?.text || '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const cleaned = jsonMatch ? jsonMatch[0] : '{}'

    let parsed: any = {}
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('JSON parse failed. Raw:', raw.slice(0, 300))
      parsed = { furnizor: 'Necunoscut', suma_totala: 0 }
    }

    // Detectare categorie dupa furnizor + tip_serviciu + filename
    const textLower = ((parsed.furnizor || '') + ' ' + (parsed.tip_serviciu || '') + ' ' + (filename || '')).toLowerCase()
    let categorie = 'alta'
    let categorieLabel = 'Alta cheltuiala'
    for (const [label, keywords] of Object.entries(FURNIZORI)) {
      if (keywords.some(k => textLower.includes(k))) {
        categorieLabel = label
        categorie = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')
        break
      }
    }

    const adrese = [parsed.adresa_consum, parsed.adresa_titular].filter(Boolean)

    return NextResponse.json({
      ...parsed,
      categorie,
      categorieLabel,
      filename,
      adrese_matching: adrese,
    })
  } catch (e: any) {
    console.error('facturi-extract error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
