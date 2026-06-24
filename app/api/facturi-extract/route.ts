import { NextRequest, NextResponse } from 'next/server'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

const FURNIZORI: Record<string, string[]> = {
  'E.ON Curent':    ['e.on energie','eon energie','eon curent','energie electrica','electricitate','standard electricity','curent electric','kwh'],
  'E.ON Gaz':       ['gaz natural','consum gaz','eon gaz','mc gaz','standard gas','gaze naturale','metri cubi gaz','mwh gaz'],
  'Urbica':         ['urbica','apa canal','apa rece','apa calda','termoficare urbica'],
  'TermoService':   ['termoservice','termoficare','caldura','gigacalorie','gcal','tsiasi','termo-service','sc termo'],
  'Salubris':       ['salubris','salubritate','gunoi','deseuri','colectare'],
  'Orange':         ['orange','abonament orange'],
  'Vodafone':       ['vodafone','abonament vodafone'],
  'Royal':          ['royal','royal imob','royal property','bl. r7','r7 sc'],
  'Internet':       ['internet','fibra','broadband','rds','digi','telekom'],
  'Asociatie':      ['asociatie','fond rulment','intretinere','cheltuieli comune','e-bloc','ebloc','nota de plata','kondo plus'],
  'Alta':           [],
}

export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType, filename } = await req.json()
    if (!base64Data) return NextResponse.json({ error: 'No file data' }, { status: 400 })

    const isImage = mimeType?.startsWith('image/')
    const mediaType = isImage ? mimeType : 'application/pdf'

    const URBICA_COD_MAP: Record<string,string> = {
      'isextia5': '83', 'is1c3zgu': '94', 'isue3rni': '88', 'isqu7njc': '99',
      'isrjpjvo': '32', 'is9woaaw': '33',
      'isbiba8y': '59', 'is9pgrum': '9', 'isxdhxbg': '64', 'islynpyd': '16',
    }

    const prompt = `Esti un expert in citirea facturilor romanesti. Analizeaza aceasta factura si extrage EXACT:
1. Furnizor: numele companiei emitente
2. Suma CURENTA de plata - DOAR factura curenta, fara restante/solduri anterioare.
   - Pentru facturi normale: cauta 'Total valoare factura curenta' sau 'Suma factura curenta'
   - Pentru TermoService (tsiasi.ro): cauta EXACT 'Total luna [LUNA] [AN]:' - aceasta e suma lunii curente. NU folosi 'Rest de plata' sau 'Restanta' care includ datorii vechi
   - Pentru E-BLOC (e-bloc.ro, Kondo Plus): cauta EXACT 'TOTAL LUNA CURENTĂ:' - aceasta e suma corecta. NU folosi 'TOTAL DE PLATĂ' care include restante
   - Pentru Royal (aplicatie mobila, Bl. R7): e un screenshot cu lista de facturi individuale. Sumeaza TOATE valorile vizibile cu status 'Neachitată' pentru luna afisata. Furnizor = 'Royal'. Adresa = apartamentul din header (ex: 'Bl. R7, sc. A, ap. 99'). nr_apartament = numarul din header.
   - NU folosi 'Sold de plata', 'Total de achitat', 'Rest de plata' care includ restante
3. Data scadentei (termenul limita de plata, format YYYY-MM-DD) - cauta 'Data scadenta', 'Termen plata', 'Data limita'
4. Data emiterii facturii (format YYYY-MM-DD) - cauta 'Data emitere', 'Data facturii', 'Emisa la'
5. Perioada facturata
5. Numarul facturii
6. Tipul serviciului (gaz natural, curent electric, apa, termoficare, salubritate, telefonie, internet, asociatie, altele)
7. ADRESA LOCULUI DE CONSUM - strada, numarul, blocul, scara, apartamentul (NU adresa sediului companiei)
8. Numele titularului contractului
9. NUMARUL APARTAMENTULUI - DOAR cifra. Surse in ordine de prioritate:
   a) Daca factura e de la URBICA: cauta campul "cod locatie" (ex: "cod locatie: is1c3zgu") si extrage codul exact in campul "cod_locatie_urbica"
   b) Din adresa de consum: "ap 83" → "83", "ap. 94" → "94"
   FOARTE IMPORTANT pentru diferentierea apartamentelor la aceeasi adresa.

Raspunde DOAR cu JSON valid, fara explicatii, fara markdown:
{
  "furnizor": "numele companiei",
  "suma_totala": 123.45,
  "moneda": "RON",
  "data_scadenta": "YYYY-MM-DD sau null",
  "data_emitere": "YYYY-MM-DD sau null",
  "perioada": "descriere perioada",
  "nr_factura": "numarul facturii",
  "tip_serviciu": "categoria",
  "adresa_consum": "strada si numarul complet al locului de consum inclusiv nr apartament",
  "nr_apartament": "doar cifra apartamentului sau null",
  "cod_locatie_urbica": "codul locatie din factura Urbica (ex: is1c3zgu) sau null",
  "adresa_titular": "adresa titularului daca e diferita",
  "titular": "numele titularului",
  "detalii": "orice info relevant"
}`

    const filePart = isImage
      ? { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64Data}` } }
      : { type: 'file', file: { filename: filename || 'factura.pdf', file_data: `data:${mediaType};base64,${base64Data}` } }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [filePart, { type: 'text', text: prompt }],
        }],
      }),
    })

    const openaiData = await openaiRes.json()

    if (openaiData.error) {
      console.error('OpenAI API error:', openaiData.error)
      return NextResponse.json({ error: openaiData.error.message }, { status: 500 })
    }

    const raw = openaiData?.choices?.[0]?.message?.content || '{}'
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
