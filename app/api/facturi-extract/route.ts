import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

const FURNIZORI: Record<string, string[]> = {
  'E.ON Curent':    ['e.on','eon curent','energie electrica','electricitate','kwh'],
  'E.ON Gaz':       ['gaz natural','consum gaz','eon gaz','mwh','mc gaz'],
  'Urbica':         ['urbica','apa canal','apa rece','apa calda','termoficare urbica'],
  'TermoService':   ['termoservice','termoficare','caldura','gigacalorie','gcal'],
  'Salubris':       ['salubris','salubritate','gunoi','deseuri','colectare'],
  'Orange':         ['orange','factura orange','abonament orange'],
  'Vodafone':       ['vodafone','factura vodafone','abonament vodafone'],
  'Royal':          ['royal','royal imob','royal property'],
  'Internet':       ['internet','fibra','broadband','rds','digi','telekom'],
  'Asociatie':      ['asociatie','fond rulment','intretinere','cheltuieli comune'],
  'Alta':           [],
}

export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType, filename } = await req.json()
    if (!base64Data) return NextResponse.json({ error: 'No file data' }, { status: 400 })

    const prompt = `Ești un expert în citirea facturilor românești. Analizează această factură și extrage EXACT:
1. Furnizor/emitent (numele companiei)
2. Suma TOTALĂ de plată (valoarea finală de achitat, în RON)
3. Data scadenței / termenul de plată
4. Perioada facturată (luna/intervalul)
5. Numărul facturii
6. Tipul serviciului (curent electric, gaz, apă, termoficare, salubritate, telefonie, internet, altele)

Răspunde DOAR cu JSON valid, fără explicații, fără markdown:
{
  "furnizor": "numele companiei",
  "suma_totala": 123.45,
  "moneda": "RON",
  "data_scadenta": "YYYY-MM-DD sau null",
  "perioada": "descriere perioadă",
  "nr_factura": "numărul facturii",
  "tip_serviciu": "categoria",
  "detalii": "orice info relevant"
}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType || 'application/pdf', data: base64Data } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
        })
      }
    )

    const geminiData = await geminiRes.json()
    const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const cleaned = raw.replace(/```json|```/g, '').trim()

    let parsed: any = {}
    try { parsed = JSON.parse(cleaned) } catch { parsed = { furnizor: 'Necunoscut', suma_totala: 0 } }

    // detectare categorie dupa furnizor + tip_serviciu
    const textLower = ((parsed.furnizor || '') + ' ' + (parsed.tip_serviciu || '') + ' ' + (filename || '')).toLowerCase()
    let categorie = 'alta'
    let categorieLabel = 'Altă cheltuială'
    for (const [label, keywords] of Object.entries(FURNIZORI)) {
      if (keywords.some(k => textLower.includes(k))) {
        categorieLabel = label
        categorie = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')
        break
      }
    }

    return NextResponse.json({ ...parsed, categorie, categorieLabel, filename })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
