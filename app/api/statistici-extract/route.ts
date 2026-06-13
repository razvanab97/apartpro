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

    const prompt = `Ești un extractor de statistici din rapoarte de platforme de cazare (Airbnb sau Booking.com).

Lista proprietăților din sistem:
${aptListText}

SARCINI:
1. Detectează platforma din imagine: "airbnb" sau "booking"
2. Identifică proprietatea: alege ID-ul din lista de mai sus care se potrivește cu numele proprietății vizibil în imagine. Dacă nu găsești o potrivire clară, pune null.
3. Extrage TOATE valorile numerice vizibile.

Returnează DOAR JSON valid, fără text suplimentar:
{
  "detected_platforma": "airbnb" sau "booking",
  "detected_apt_id": "uuid din lista de mai sus" sau null,

  "rata_ocupare": procent ca număr (ex: 36.4) sau null,
  "nopti_rezervate": număr sau null,
  "nopti_blocate": număr sau null,
  "nopti_fara_rezervare": număr sau null,
  "checkin_uri": număr sau null,
  "rata_anulari": procent ca număr sau null,
  "durata_medie_sedere": număr zile (ex: 2.7) sau null,
  "tarif_mediu_noapte": număr RON sau null,
  "tarif_vs_similar": delta RON față de similare (ex: 150 sau -50) sau null,
  "afisari_pagina_total": număr total afișări pagină sau null,
  "afisari_p1_total": număr total afișări prima pagină căutare sau null,
  "rata_afisari_p1": procent afișări prima pagină (ex: 70.4) sau null,
  "rata_conversie_globala": procent (ex: 1.01) sau null,
  "rata_conversie_cautari_p1": procent căutări pe prima pagină (ex: 70.4) sau null,
  "rata_conversie_vizite_rez": procent vizite spre rezervări (ex: 5.11) sau null,
  "wishlist_total": număr sau null,
  "wishlist_vs_similar": delta față de similare (ex: -4) sau null,
  "rata_ocupare_vs_similar": delta procent față de similare (ex: 26.3) sau null,
  "durata_sedere_vs_similar": delta zile față de similare (ex: -0.3) sau null,
  "vizualizari_cautari": număr sau null,
  "vizualizari_pagina": număr sau null,
  "rezervari_confirmate": număr sau null,
  "scor_pozitie_rank": rangul numeric (ex: 559) sau null,
  "scor_pozitie_total": totalul din care face parte rangul (ex: 686) sau null,
  "scor_pozitie_pct": procentul mai-bine-decât-X% (ex: 18.0) sau null,
  "rata_conversie_cautari": procent conversie căutări (ex: 1.80) sau null,
  "rata_conversie_pagina": procent conversie pagină (ex: 2.05) sau null,
  "adr": tarif mediu zilnic RON sau null,
  "scor_comentarii": număr (ex: 9.0) sau null,
  "completare_pagina_pct": procent completare pagina proprietății (ex: 78) sau null
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
