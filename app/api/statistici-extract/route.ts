import { NextRequest, NextResponse } from 'next/server'

const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY ?? ''

export async function POST(req: NextRequest) {
  if (!CLAUDE_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY nu este configurat pe server' }, { status: 500 })
  try {
    const body = await req.json()
    const { base64Data, mimeType, filename, aptList } = body

    const aptListText = Array.isArray(aptList) && aptList.length
      ? aptList.map((a: any) => `  - ID: ${a.id} | Nume: ${a.name}`).join('\n')
      : '  (nicio proprietate în sistem)'

    const isPDF = mimeType === 'application/pdf'
    const isCSV = mimeType === 'text/csv' || filename?.endsWith('.csv')

    const prompt = `Ești un extractor expert de statistici din dashboard-urile Airbnb și Booking.com în limba română.

Lista proprietăților din sistem (pentru auto-detecție):
${aptListText}

═══════════════════════════════════════════
STRUCTURA DASHBOARD AIRBNB (interfață română)
═══════════════════════════════════════════
Airbnb afișează fiecare metrică pe o secțiune/pagină separată. Documentul poate conține mai multe pagini, fiecare cu o metrică diferită. Parcurge TOATE paginile și extrage tot ce găsești.

MAPARE EXACTĂ label Airbnb → câmp JSON:

[SECȚIUNEA "Rată de ocupare"]
  "Rată de ocupare" (valoarea principală, ex: "100.0%") → rata_ocupare (număr, ex: 100.0)
  "Total nopți rezervate" → nopti_rezervate (număr întreg)
  "Total nopți blocate" → nopti_blocate (număr întreg)
  "Total nopți fără rezervare" → nopti_fara_rezervare (număr întreg)
  "Total check-in-uri" → checkin_uri (număr întreg)

[SECȚIUNEA "Rata de anulare"]
  "Rata de anulare" (valoarea principală, ex: "0.0%") → rata_anulari (număr, ex: 0.0)

[SECȚIUNEA "Durata șederii"]
  "Durata medie a șederii" (ex: "1.0 zi") → durata_medie_sedere (număr, ex: 1.0) — ignoră "zi/zile"

[SECȚIUNEA "Tarif pe noapte"]
  "Tarif mediu pe noapte" (ex: "201 RON") → tarif_mediu_noapte (număr, ex: 201.0) — ignoră "RON"

[SECȚIUNEA "Afișările paginii"]
  "Numărul total de afișări ale paginii" → afisari_pagina_total (număr întreg)
  "Total afișări de căutare pe prima pagină" → afisari_p1_total (număr întreg)

[SECȚIUNEA "Conversia în rezervări" sau "Rata globală de conversie"]
  "Rata globală de conversie" (ex: "0.71%") → rata_conversie_globala (număr, ex: 0.71)
  "Rata afișărilor de căutare pe prima pagină" (ex: "46.5%") → rata_afisari_p1 (număr, ex: 46.5)
  "Rata de conversie a căutărilor în vizite ale anunțului" (ex: "30.00%") → rata_conversie_cautari_p1 (număr, ex: 30.0)
  "Rata de conversie a vizitelor anunțului în rezervări" (ex: "2.38%") → rata_conversie_vizite_rez (număr, ex: 2.38)

[SECȚIUNEA "Numărul de adăugări la lista de dorințe"]
  valoarea principală (ex: "3") → wishlist_total (număr întreg)

═══════════════════════════════════════════
STRUCTURA DASHBOARD BOOKING.COM (interfață română)
═══════════════════════════════════════════
  "Vizualizări în căutări" sau "vizualizări cautari" → vizualizari_cautari (număr întreg)
  "Vizualizări pagină" sau "vizualizări pagina" → vizualizari_pagina (număr întreg)
  "Rezervări confirmate" → rezervari_confirmate (număr întreg)
  "Locul în clasament" sau "rangul" (ex: "559 din 686") → scor_pozitie_rank=559, scor_pozitie_total=686
  Procentaj clasament (ex: "mai bine de X%") → scor_pozitie_pct (număr)
  "Rata de conversie" din căutări → rata_conversie_cautari (număr)
  "Rata de conversie" din vizualizări pagină → rata_conversie_pagina (număr)
  "ADR" sau "Tarif mediu zilnic" → adr (număr)
  "Scor comentarii" sau "nota medie" → scor_comentarii (număr)
  "Completare pagină" → completare_pagina_pct (număr)

═══════════════════════════════════════════
INSTRUCȚIUNI GENERALE
═══════════════════════════════════════════
1. Detectează platforma: "airbnb" sau "booking"
2. Identifică proprietatea: caută numele din lista de mai sus care apare în interfață (ex: în titlul tab-ului browser, header pagină, etc.). Dacă nu găsești potrivire clară, pune null.
3. Extrage TOATE valorile din TOATE paginile/secțiunile documentului.
4. Pentru procente: returnează NUMĂRUL simplu (ex: "46.5%" → 46.5, nu 0.465)
5. Pentru valori cu unități: elimină unitatea (RON, zi, zile, %)
6. Dacă o valoare nu e vizibilă în document, pune null — NU inventa valori.
7. Ignoră graficele și valorile comparative cu "similare" — extrage doar valorile proprii ale proprietății.

Returnează DOAR JSON valid, fără text suplimentar, fără markdown:
{
  "detected_platforma": "airbnb" sau "booking",
  "detected_apt_id": "uuid din lista de mai sus sau null",
  "rata_ocupare": null,
  "nopti_rezervate": null,
  "nopti_blocate": null,
  "nopti_fara_rezervare": null,
  "checkin_uri": null,
  "rata_anulari": null,
  "durata_medie_sedere": null,
  "tarif_mediu_noapte": null,
  "tarif_vs_similar": null,
  "afisari_pagina_total": null,
  "afisari_p1_total": null,
  "rata_afisari_p1": null,
  "rata_conversie_globala": null,
  "rata_conversie_cautari_p1": null,
  "rata_conversie_vizite_rez": null,
  "wishlist_total": null,
  "wishlist_vs_similar": null,
  "rata_ocupare_vs_similar": null,
  "durata_sedere_vs_similar": null,
  "vizualizari_cautari": null,
  "vizualizari_pagina": null,
  "rezervari_confirmate": null,
  "scor_pozitie_rank": null,
  "scor_pozitie_total": null,
  "scor_pozitie_pct": null,
  "rata_conversie_cautari": null,
  "rata_conversie_pagina": null,
  "adr": null,
  "scor_comentarii": null,
  "completare_pagina_pct": null
}`

    let content: any[]
    if (isCSV) {
      const csvText = Buffer.from(base64Data, 'base64').toString('utf-8')
      content = [{ type: 'text', text: `CSV:\n\n${csvText}\n\n${prompt}` }]
    } else if (isPDF) {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
        { type: 'text', text: prompt }
      ]
    } else {
      content = [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
        { type: 'text', text: prompt }
      ]
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content }] })
    })

    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return NextResponse.json({ error: data?.error?.message || `API error ${res.status}` }, { status: 500 })

    const text = data.content?.find((c: any) => c.type === 'text')?.text || '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    try {
      return NextResponse.json(JSON.parse(clean))
    } catch {
      return NextResponse.json({ error: 'AI a returnat date invalide, încearcă din nou' }, { status: 500 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
