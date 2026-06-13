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

    // CSV: parse direct, fără AI
    if (isCSV) {
      const csvText = Buffer.from(base64Data, 'base64').toString('utf-8')
      return NextResponse.json(parseAirbnbCSV(csvText))
    }

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
Dashboard-ul Booking are DOUĂ pagini. FOLOSEȘTE DOAR PAGINA 1 (date din ultimele 90 zile).
IGNORĂ COMPLET PAGINA 2 — aceasta conține date din ultimele 30 zile și generează confuzii.

PAGINA 1 — structura exactă vizuală:

┌─ TITLU ──────────────────────────────────────────────────┐
│ "Dashboard Clasament pentru [NUME PROPRIETATE]"          │
└──────────────────────────────────────────────────────────┘

┌─ FLUX PRINCIPAL (3 cutii conectate prin săgeți) ─────────┐
│                                                           │
│  [Cutia 1]           [Săgeată]        [Cutia 2]          │
│  "Vizualizări în     X,XX%            "Vizualizări ale   │
│  rezultatele         ↓ (procent        paginii           │
│  căutărilor"          conversie        proprietății"     │
│  NUMĂR_MARE          cautari→pagina)   NUMĂR_MIC         │
│                                                          │
│                      [Săgeată]        [Cutia 3]          │
│                      Y,YY%            "Rezervări"        │
│                      (procent          NUMĂR_REZERVĂRI   │
│                       conversie                          │
│                       pagina→rezervari)                  │
└──────────────────────────────────────────────────────────┘
→ vizualizari_cautari = numărul din Cutia 1 (cel mai mare, ex: 121.574)
→ rata_conversie_cautari = procentul din PRIMA săgeată (ex: 1,25%) — scris ca "X% din vizualizările în rezultatele căutărilor s-au transformat în vizualizări ale paginii"
→ vizualizari_pagina = numărul din Cutia 2 (ex: 1.525)
→ rata_conversie_pagina = procentul din A DOUA săgeată (ex: 2,56%) — scris ca "Y% din vizualizările paginii proprietății au fost convertite în rezervări"
→ rezervari_confirmate = numărul din Cutia 3 (cel mai mic, ex: 39)

ATENȚIE CRITICĂ: vizualizari_cautari este cel mai mare număr (zeci de mii).
NU confunda cu numerele din Pagina 2 (care sunt mult mai mici — date din 30 zile)!

┌─ SCOR POZIȚIE ───────────────────────────────────────────┐
│ "Scorul dumneavoastră de poziție în rezultatele          │
│  căutărilor: RANK din TOTAL"                             │
│  ex: "352 din 691"                                       │
│ "Mai bine decât PCT% din proprietățile din oraș"         │
└──────────────────────────────────────────────────────────┘
→ scor_pozitie_rank = primul număr (ex: 352) — RANGUL, NU numărul de vizualizări!
→ scor_pozitie_total = al doilea număr după "din" (ex: 691)
→ scor_pozitie_pct = procentul "mai bine decât X%" (ex: 49)

┌─ FACTORI CARE VĂ INFLUENȚEAZĂ SCORUL ───────────────────┐
│ "Conversia: X,XX%  Proprietatea dumneavoastră"           │
│   → rata_conversie_pagina (același cu a 2-a săgeată)    │
│ "Tarif mediu zilnic: XXX,XX lei  Proprietatea dvs."      │
│   → adr (ignoră "lei")                                  │
│ "Anulările: X,X%  Proprietatea dumneavoastră"            │
│   → rata_anulari                                         │
└──────────────────────────────────────────────────────────┘

┌─ SCORURI CALITATE ───────────────────────────────────────┐
│ "Scorul din comentarii: X.X"  → scor_comentarii          │
│ "Scorul paginii proprietății: X%"  → completare_pagina_pct│
└──────────────────────────────────────────────────────────┘

┌─ PAGINA 2 — Date din ultimele 30 de zile ───────────────┐
│ Secțiunea "Cum vi s-a schimbat performanța"              │
│ Afișează 3 numere pentru ultimele 30 de zile:            │
│   "Vizualizări în rezultatele căutărilor: NR"            │
│   "Vizualizări proprietate: NR"                          │
│   "Rezervări: NR"                                        │
└──────────────────────────────────────────────────────────┘
→ vizualizari_cautari_30z = numărul din "Vizualizări în rezultatele căutărilor" de pe pagina 2
→ vizualizari_pagina_30z = numărul din "Vizualizări proprietate" de pe pagina 2
→ rezervari_confirmate_30z = numărul din "Rezervări" de pe pagina 2

REGULI CRITICE BOOKING:
- scor_pozitie_rank vine DOAR din textul "RANK din TOTAL" (ex: "352 din 691" → rank=352)
- NU confunda scor_pozitie_rank cu vizualizari_pagina_30z sau orice alt număr
- vizualizari_cautari (90 zile) vine din Cutia 1 de pe pagina 1 — cel mai mare număr (zeci/sute de mii)
- vizualizari_cautari_30z vine din pagina 2 — număr mai mic (câteva mii/zeci de mii)

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
  "vizualizari_cautari_30z": null,
  "vizualizari_pagina_30z": null,
  "rezervari_confirmate_30z": null,
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
    if (isPDF) {
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

// Mapare label CSV (lowercase, fără diacritice sau cu) → câmp DB
const CSV_MAP: Record<string, string> = {
  // Ocupare
  'rata de ocupare':                                              'rata_ocupare',
  'total nopti rezervate':                                        'nopti_rezervate',
  'total nopți rezervate':                                        'nopti_rezervate',
  'total nopti blocate':                                          'nopti_blocate',
  'total nopți blocate':                                          'nopti_blocate',
  'total nopti fara rezervare':                                   'nopti_fara_rezervare',
  'total nopți fără rezervare':                                   'nopti_fara_rezervare',
  'total check-in-uri':                                           'checkin_uri',
  'rata de anulare':                                              'rata_anulari',
  'durata medie a sederii':                                       'durata_medie_sedere',
  'durata medie a șederii':                                       'durata_medie_sedere',
  // Tarif
  'tarif mediu pe noapte':                                        'tarif_mediu_noapte',
  // Conversie — format vechi (->)
  'rata globala de conversie':                                    'rata_conversie_globala',
  'rata globală de conversie':                                    'rata_conversie_globala',
  'rata de conversie cautari -> afisari pagina':                  'rata_afisari_p1',
  'rata de conversie căutări -> afișări pagină':                  'rata_afisari_p1',
  'rata de conversie afisari pagina -> rezervari':                'rata_conversie_vizite_rez',
  'rata de conversie afișări pagină -> rezervări':                'rata_conversie_vizite_rez',
  'rata de conversie cautari -> vizite anunt':                    'rata_conversie_cautari_p1',
  'rata de conversie căutări -> vizite anunț':                    'rata_conversie_cautari_p1',
  // Conversie — format nou (fraze lungi fără ->)
  'rata afisarilor de cautare pe prima pagina':                   'rata_afisari_p1',
  'rata afișărilor de căutare pe prima pagină':                   'rata_afisari_p1',
  'rata de conversie a cautarilor in vizite ale anuntului':       'rata_conversie_cautari_p1',
  'rata de conversie a căutărilor în vizite ale anunțului':       'rata_conversie_cautari_p1',
  'rata de conversie a vizitelor anuntului in rezervari':         'rata_conversie_vizite_rez',
  'rata de conversie a vizitelor anunțului în rezervări':         'rata_conversie_vizite_rez',
  // Afișări
  'numar total afisari pagina (cautare)':                         'afisari_pagina_total',
  'număr total afișări pagină (căutare)':                         'afisari_pagina_total',
  'numar total de afisari ale paginii':                           'afisari_pagina_total',
  'număr total de afișări ale paginii':                           'afisari_pagina_total',
  'total afisari de cautare pe prima pagina':                     'afisari_p1_total',
  'total afișări de căutare pe prima pagină':                     'afisari_p1_total',
  // Wishlist
  'numar total adaugari lista de dorinte':                        'wishlist_total',
  'număr total adăugări lista de dorințe':                        'wishlist_total',
  'numar total de adaugari la lista de dorinte':                  'wishlist_total',
  'număr total de adăugări la lista de dorințe':                  'wishlist_total',
  // Booking
  'vizualizari cautari':                                          'vizualizari_cautari',
  'vizualizări căutări':                                          'vizualizari_cautari',
  'vizualizari pagina':                                           'vizualizari_pagina',
  'vizualizări pagină':                                           'vizualizari_pagina',
  'rezervari confirmate':                                         'rezervari_confirmate',
  'rezervări confirmate':                                         'rezervari_confirmate',
  'rang':                                                         'scor_pozitie_rank',
  'total proprietati in clasament':                               'scor_pozitie_total',
  'procent clasament':                                            'scor_pozitie_pct',
  'rata conversie cautari':                                       'rata_conversie_cautari',
  'rata conversie pagina':                                        'rata_conversie_pagina',
  'adr':                                                          'adr',
  'scor comentarii':                                              'scor_comentarii',
  'completare pagina':                                            'completare_pagina_pct',
}

function stripUnits(raw: string): number | null {
  // Elimină unități: %, RON, lei, zile, zi, nopți, nopti, numar, număr
  const cleaned = raw
    .replace(/[%]/g, '')
    .replace(/\bRON\b|\blei\b|\bzile\b|\bzi\b|\bnopți\b|\bnopti\b|\bnumăr\b|\bnumar\b/gi, '')
    .replace(',', '.')
    .trim()
  const val = parseFloat(cleaned)
  return isNaN(val) ? null : val
}

function parseAirbnbCSV(csv: string): Record<string, any> {
  const result: Record<string, any> = { detected_platforma: 'airbnb', detected_apt_id: null }
  const lines = csv.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return result

  // Auto-detectare format după header
  // Format A: "Metric,Value,Period,Unit,Notes"      → label=col[0], value=col[1]
  // Format B: "Categorie,Metric,Valoare,Perioada,…" → label=col[1], value=col[2]
  const header = lines[0].toLowerCase()
  const isFormatB = header.startsWith('categorie') || (header.includes('metric') && header.includes('valoare'))
  const labelCol = isFormatB ? 1 : 0
  const valueCol = isFormatB ? 2 : 1

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length <= valueCol) continue
    const label = cols[labelCol]?.trim().toLowerCase()
    const raw = cols[valueCol]?.trim()
    if (!label || !raw) continue
    const val = stripUnits(raw)
    if (val === null) continue
    const field = CSV_MAP[label]
    if (field) result[field] = val
  }
  return result
}
