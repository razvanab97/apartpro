import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

const FURNIZORI: Record<string, string[]> = {
  'E.ON Curent':    ['e.on','eon curent','energie electrica','electricitate','kwh','standard electricity'],
  'E.ON Gaz':       ['gaz natural','consum gaz','eon gaz','mwh','mc gaz','standard gas','gaze naturale'],
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

    const prompt = `Esti un expert in citirea facturilor romanesti. Analizeaza aceasta factura si extrage EXACT urmatoarele informatii:

1. Furnizor/emitent: numele companiei (ex: E.ON Energie Romania, Urbica, Salubris)
2. Suma TOTALA de plata cu TVA (valoarea finala de achitat, in RON/Lei)
3. Data scadentei (termenul limita de plata)
4. Perioada facturata (luna sau intervalul de consum)
5. Numarul facturii
6. Tipul serviciului (gaz natural, curent electric, apa, termoficare, salubritate, telefonie, internet, asociatie, altele)
7. ADRESA LOCULUI DE CONSUM - FOARTE IMPORTANT: strada, numarul, blocul, scara, apartamentul unde este montat contorul/contractul (NU adresa sediului companiei)
8. Adresa titularului contractului (poate fi aceeasi cu locul de consum)
9. Numele titularului contractului

Raspunde DOAR cu JSON valid, fara explicatii, fara markdown:
{
  "furnizor": "numele companiei",
  "suma_totala": 123.45,
  "moneda": "RON",
  "data_scadenta": "YYYY-MM-DD sau null",
  "perioada": "descriere perioada",
  "nr_factura": "numarul facturii",
  "tip_serviciu": "categoria",
  "adresa_consum": "strada si numarul COMPLET al locului de consum",
  "adresa_titular": "adresa titularului daca e diferita",
  "titular": "numele titularului",
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
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
        })
      }
    )

    const geminiData = await geminiRes.json()
    
    // Log erori Gemini
    if (geminiData.error) {
      console.error('Gemini error:', JSON.stringify(geminiData.error))
      return NextResponse.json({ 
        error: `Gemini: ${geminiData.error.message}`,
        furnizor: 'Eroare API', suma_totala: 0, categorie: 'alta', categorieLabel: 'Alta cheltuiala'
      }, { status: 500 })
    }

    const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const cleaned = raw.replace(/```json|```/g, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim()

    let parsed: any = {}
    try { 
      parsed = JSON.parse(cleaned) 
    } catch { 
      console.error('JSON parse failed. Raw:', raw.slice(0, 200))
      parsed = { furnizor: 'Necunoscut', suma_totala: 0 } 
    }

    // detectare categorie dupa furnizor + tip_serviciu
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

    // Construieste lista de adrese pentru matching
    const adrese = [
      parsed.adresa_consum,
      parsed.adresa_titular,
    ].filter(Boolean)

    return NextResponse.json({ 
      ...parsed, 
      categorie, 
      categorieLabel, 
      filename,
      adrese_matching: adrese, // toate adresele pentru matching
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
